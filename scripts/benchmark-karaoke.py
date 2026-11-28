"""Compare three stereo vocal-removal baselines on generated reference stems."""
import itertools
import json
import time
import tracemalloc

import numpy as np

RATE = 16000
WINDOW = 512
HOP = 128


def fixture(style):
    t = np.arange(4 * RATE) / RATE
    voice = (np.sin(2*np.pi*(225*t + 2*np.sin(t))) +
             .4*np.sin(2*np.pi*440*t) + .2*np.sin(2*np.pi*650*t))
    voice *= .14 * (.45 + .55*np.sin(2*np.pi*2.3*t)**2)
    kick = .25 * np.sin(2*np.pi*58*t) * np.exp(-18*(t % .5))
    bass = .09*np.sin(2*np.pi*82*t)
    piano = .08*np.sin(2*np.pi*440*t)*np.exp(-3*(t % .66))
    sides = np.array([.13*np.sin(2*np.pi*613*t), .13*np.sin(2*np.pi*917*t)])
    if style == 'acoustic':
        music = sides*.55 + piano + bass*.45
        vocals = np.array([voice, voice*.88-np.roll(voice,130)*.12])
    elif style == 'dense':
        music = sides + piano*1.4 + bass + kick*.65
        vocals = np.array([voice, voice*.77+np.roll(voice,90)*.13])
    else:
        music = sides*.85 + bass + kick
        vocals = np.array([voice, voice])
    return music, vocals


def band_reject(mid, side):
    freq = np.fft.rfftfreq(len(mid), 1/RATE)
    scale = np.ones(len(freq))
    scale[(freq >= 140) & (freq <= 3400)] = .08
    m = np.fft.irfft(np.fft.rfft(mid)*scale, n=len(mid))
    return np.array([m+side, m-side])


def adaptive(input_sig):
    window = np.hanning(WINDOW)
    frames = np.lib.stride_tricks.sliding_window_view(input_sig, WINDOW, axis=1)[:,::HOP,:]
    l, r = np.fft.rfft(frames*window)
    mid, side = (l+r)/2, (l-r)/2
    confidence = np.abs(mid)/(np.abs(side)+np.abs(mid)+1e-8)
    freq = np.fft.rfftfreq(WINDOW,1/RATE)
    mask = np.where((freq >= 140)&(freq <= 6000),
                    np.clip(1-1.2*confidence, .10, 1), 1)
    output = np.zeros_like(input_sig)
    weight = np.zeros(input_sig.shape[1])
    spectra = np.stack((mid*mask+side,mid*mask-side))
    for i, frame in enumerate(np.fft.irfft(spectra)):
        for j, part in enumerate(frame):
            start = j*HOP
            output[i,start:start+WINDOW] += part*window
            if i == 0:
                weight[start:start+WINDOW] += window**2
    return output/np.maximum(weight,1e-7), mask


def apply_mask(input_sig, mask):
    window = np.hanning(WINDOW)
    frames = np.lib.stride_tricks.sliding_window_view(input_sig, WINDOW, axis=1)[:,::HOP,:]
    l,r = np.fft.rfft(frames*window)
    mid,side=(l+r)/2,(l-r)/2
    frames=np.fft.irfft(np.stack((mid*mask+side,mid*mask-side)))
    output=np.zeros_like(input_sig)
    weight=np.zeros(input_sig.shape[1])
    for j in range(frames.shape[1]):
        start=j*HOP
        output[:,start:start+WINDOW] += frames[:,j,:]*window
        weight[start:start+WINDOW] += window**2
    return output/np.maximum(weight,1e-7)


def mid_side(sig):
    return (sig[0]+sig[1])/2, (sig[0]-sig[1])/2


def level(signal):
    return max(float(np.sqrt(np.mean(signal**2))),1e-12)


def delta(original, new):
    return round(20*np.log10(level(new)/level(original)),1)


def shift(signal, samples):
    result = np.zeros_like(signal)
    if samples > 0:
        result[:, samples:] = signal[:, :-samples]
    elif samples < 0:
        result[:, :samples] = signal[:, -samples:]
    else:
        result[:] = signal
    return result


def align(reference, estimate):
    """Use the preserved stereo side as a timing and level reference."""
    target, actual = mid_side(reference)[1], mid_side(estimate)[1]
    if min(level(target), level(actual)) < .0001:
        return 0, 1.0
    length = len(target)
    fft_size = 1 << (2*length-1).bit_length()
    correlation = np.fft.irfft(
        np.fft.rfft(target, fft_size)*np.conjugate(np.fft.rfft(actual, fft_size)), fft_size)
    limit = RATE//100
    lags = np.arange(-limit, limit+1)
    offset = int(lags[np.argmax(correlation[lags])])
    useful = slice(WINDOW, -WINDOW)
    _, shifted = mid_side(shift(estimate, offset))
    gain = np.clip(level(target[useful])/level(shifted[useful]), .5, 2)
    return offset, float(gain)


def individual(track, music, vocals):
    for method in ('mid_side','band_limited','adaptive'):
        tracemalloc.start()
        start = time.perf_counter()
        if method == 'mid_side':
            def apply(signal):
                side = mid_side(signal)[1]
                return np.array([side, -side])
            result = apply(track)
        elif method == 'band_limited':
            def apply(signal):
                return band_reject(*mid_side(signal))
            result = apply(track)
        else:
            result, mask = adaptive(track)
            def apply(signal):
                return apply_mask(signal, mask)

        offset, gain = align(track, result)
        runtime = time.perf_counter()-start
        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        # The mixture supplies the separation mask and alignment for both reference stems.
        yield method, gain*shift(apply(music), offset), gain*shift(apply(vocals), offset), {
            'seconds': round(runtime, 4), 'peak_traced_mib': round(peak/1048576, 2),
            'delay_samples': offset, 'level_scale': round(gain, 4)
        }


def metrics(music, vocals, backing, remaining):
    useful = slice(WINDOW, -WINDOW)
    music, vocals = music[:, useful], vocals[:, useful]
    backing, remaining = backing[:, useful], remaining[:, useful]
    error = backing-music
    return {
        'vocal_delta_db': delta(vocals, remaining),
        'music_delta_db': delta(music, backing),
        'music_error_db': delta(music, error),
        'total_error_db': round(10*np.log10(
            (level(error)**2+level(remaining)**2)/(level(music)**2+level(vocals)**2)), 2)
    }


def evaluate(style):
    music, vocals = fixture(style)
    methods = list(individual(music+vocals, music, vocals))
    single = {}
    for name, backing, remaining, diagnostics in methods:
        single[name] = metrics(music, vocals, backing, remaining)
        print(json.dumps({'fixture': style, 'method': name, **diagnostics, **single[name]}))

    best = min(single, key=lambda name: single[name]['total_error_db'])
    baseline = single[best]
    best_ensemble = None
    for count in (2, 3):
        for group in itertools.combinations(methods, count):
            options = ((.5, .5), (.67, .33), (.33, .67)) if count == 2 else ((1/3,)*3,)
            for weights in options:
                start = time.perf_counter()
                backing = sum(weight*entry[1] for weight, entry in zip(weights, group))
                remaining = sum(weight*entry[2] for weight, entry in zip(weights, group))
                elapsed = round(sum(row[3]['seconds'] for row in group)+time.perf_counter()-start, 4)
                result = {
                    'methods': [row[0] for row in group],
                    'weights': [round(weight, 3) for weight in weights],
                    'seconds': elapsed,
                    **metrics(music, vocals, backing, remaining)
                }
                if (result['total_error_db'] <= baseline['total_error_db']-.2
                        and result['vocal_delta_db'] <= baseline['vocal_delta_db']+.25
                        and result['music_error_db'] <= baseline['music_error_db']+.25
                        and (best_ensemble is None or result['total_error_db'] < best_ensemble['total_error_db'])):
                    best_ensemble = result
    print(json.dumps({'fixture': style, 'best_single': best,
                      'selected': best_ensemble or {'methods': [best], **baseline}}))


if __name__ == '__main__':
    for style in ('electronic','acoustic','dense'):
        evaluate(style)
