using System;
using System.Runtime.InteropServices;
using System.Threading;

internal static class IslandClick
{
    private const int MouseHook = 14;
    private const uint Outside = 0x8001;
    private const uint Stop = 0x8002;
    private static readonly HookProc Callback = OnMouse;
    private static IntPtr island;
    private static IntPtr hook;
    private static uint threadId;

    [StructLayout(LayoutKind.Sequential)]
    private struct Point { public int X, Y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    private struct Message
    {
        public IntPtr Window;
        public uint Id;
        public IntPtr WParam, LParam;
        public uint Time;
        public Point Location;
        public uint Private;
    }

    private delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int id, HookProc callback, IntPtr module, uint thread);
    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll")]
    private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr GetModuleHandle(string module);
    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")]
    private static extern bool PeekMessage(out Message message, IntPtr hwnd, uint first, uint last, uint remove);
    [DllImport("user32.dll")]
    private static extern int GetMessage(out Message message, IntPtr hwnd, uint first, uint last);
    [DllImport("user32.dll")]
    private static extern bool PostThreadMessage(uint thread, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")]
    private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out Rect rect, int size);

    private static bool Contains(Rect frame, int x, int y, double radius)
    {
        if (x < frame.Left || x >= frame.Right || y < frame.Top || y >= frame.Bottom)
            return false;
        radius = Math.Min(radius, Math.Min(frame.Right - frame.Left, frame.Bottom - frame.Top) / 2.0);
        double cx = Math.Max(frame.Left + radius, Math.Min(x, frame.Right - radius));
        double cy = Math.Max(frame.Top + radius, Math.Min(y, frame.Bottom - radius));
        return (x-cx)*(x-cx) + (y-cy)*(y-cy) <= radius*radius;
    }

    private static IntPtr OnMouse(int code, IntPtr message, IntPtr data)
    {
        long kind = message.ToInt64();
        if (code == 0 && (kind == 0x201 || kind == 0x204 || kind == 0x207 || kind == 0x20B))
        {
            // Only button-down positions are checked, and coordinates never leave the hook.
            Rect frame;
            if (IsWindowVisible(island) &&
                (DwmGetWindowAttribute(island, 9, out frame, Marshal.SizeOf(typeof(Rect))) == 0 ||
                 GetWindowRect(island, out frame)))
            {
                int x = Marshal.ReadInt32(data, 0), y = Marshal.ReadInt32(data, 4);
                uint dpi = GetDpiForWindow(island);
                if (!Contains(frame, x, y, 28.0 * Math.Max(dpi, 96) / 96.0))
                    PostThreadMessage(threadId, Outside, IntPtr.Zero, IntPtr.Zero);
            }
        }
        return CallNextHookEx(hook, code, message, data);
    }

    private static int Main(string[] arguments)
    {
        if (arguments.Length == 1 && arguments[0] == "--check")
        {
            var test = new Rect { Left = -300, Top = 20, Right = 40, Bottom = 220 };
            return Contains(test, -30, 120, 28) && !Contains(test, -299, 21, 28) &&
                   !Contains(test, 41, 100, 28) && Contains(test, -270, 21, 28) ? 0 : 1;
        }
        bool probe = arguments.Length == 1 && arguments[0] == "--probe";
        long handle;
        if (!probe && (arguments.Length != 1 || !long.TryParse(arguments[0], out handle) || handle <= 0))
            return 2;
        island = probe ? IntPtr.Zero : new IntPtr(long.Parse(arguments[0]));
        SetThreadDpiAwarenessContext(new IntPtr(-4));
        threadId = GetCurrentThreadId();
        Message message;
        PeekMessage(out message, IntPtr.Zero, 0, 0, 0);
        hook = SetWindowsHookEx(MouseHook, Callback, GetModuleHandle(null), 0);
        if (hook == IntPtr.Zero)
            return 3;
        try
        {
            if (probe)
                return 0;
            var endOfInput = new Thread(() =>
            {
                try { Console.In.ReadLine(); }
                finally { PostThreadMessage(threadId, Stop, IntPtr.Zero, IntPtr.Zero); }
            });
            endOfInput.IsBackground = true;
            endOfInput.Start();
            while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0)
            {
                if (message.Id == Stop)
                    break;
                if (message.Id == Outside)
                {
                    Console.WriteLine("outside");
                    Console.Out.Flush();
                    break;
                }
            }
            return 0;
        }
        finally { UnhookWindowsHookEx(hook); }
    }
}
