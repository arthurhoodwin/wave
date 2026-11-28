"""Compare three stereo vocal-removal baselines on generated reference stems."""
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


for style in ('electronic','acoustic','dense'):
    music, vocals = fixture(style)
    track = music + vocals
    for method in ('mid_side','band_limited','adaptive'):
        tracemalloc.start()
        start=time.perf_counter()
        if method == 'mid_side':
            def apply(sig):
                side=mid_side(sig)[1]
                return np.array([side,-side])
            result=apply(track)
        elif method == 'band_limited':
            def apply(sig):
                return band_reject(*mid_side(sig))
            result=apply(track)
        else:
            result, mask=adaptive(track)
            def apply(sig):
                return apply_mask(sig,mask)
        _,peak=tracemalloc.get_traced_memory()
        tracemalloc.stop()
        runtime=time.perf_counter()-start
        # Use the mixture's own mask to measure residual vocal and instrument change.
        useful=slice(WINDOW,-WINDOW)
        backing=apply(music)[:,useful]
        remaining=apply(vocals)[:,useful]
        print(json.dumps({'fixture':style,'method':method,'seconds':round(runtime,3),
                          'peak_traced_mib':round(peak/1048576,2),
                          'vocal_delta_db':delta(vocals[:,useful],remaining),
                          'music_delta_db':delta(music[:,useful],backing),
                          'music_error_db':delta(music[:,useful],backing-music[:,useful])}))
