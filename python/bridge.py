#!/usr/bin/env python3
"""Small, JSON-lines computer bridge used by the Pi extension.

It intentionally exposes a narrow action allowlist; it does not execute shell commands.
"""
from __future__ import annotations

import base64
import io
import json
import sys
import time
import webbrowser


def respond(payload: dict) -> dict:
    try:
        import pyautogui
        import mss
        from PIL import Image

        pyautogui.FAILSAFE = True
        pyautogui.PAUSE = 0.08
        action = payload.get("action")

        if action == "capture":
            max_side = max(320, min(2048, int(payload.get("max_side", 1568))))
            with mss.mss() as capture:
                monitor = capture.monitors[1]  # primary display only
                shot = capture.grab(monitor)
                image = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
            image.thumbnail((max_side, max_side))
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=82, optimize=True)
            return {
                "ok": True,
                "image_base64": base64.b64encode(buffer.getvalue()).decode("ascii"),
                "width": image.width,
                "height": image.height,
            }

        screen_width, screen_height = pyautogui.size()
        if action in ("click", "double_click"):
            x = float(payload["x"])
            y = float(payload["y"])
            if not (0 <= x <= 1 and 0 <= y <= 1):
                raise ValueError("Coordinates must be normalized between 0 and 1.")
            px, py = round(x * (screen_width - 1)), round(y * (screen_height - 1))
            if action == "double_click":
                pyautogui.doubleClick(px, py)
            else:
                pyautogui.click(px, py)
        elif action == "type":
            value = payload.get("text")
            if not isinstance(value, str) or not value or len(value) > 500:
                raise ValueError("Text must be 1–500 characters.")
            x = float(payload["x"])
            y = float(payload["y"])
            if not (0 <= x <= 1 and 0 <= y <= 1):
                raise ValueError("Typing target coordinates must be normalized between 0 and 1.")
            pyautogui.click(round(x * (screen_width - 1)), round(y * (screen_height - 1)))
            pyautogui.write(value, interval=0.01)
        elif action == "press":
            key_map = {
                "ENTER": "enter", "TAB": "tab", "ESC": "esc", "BACKSPACE": "backspace",
                "DELETE": "delete", "SPACE": "space", "UP": "up", "DOWN": "down",
                "LEFT": "left", "RIGHT": "right",
            }
            key = str(payload.get("key", "")).upper()
            if key not in key_map:
                raise ValueError("Key is not allowed.")
            pyautogui.press(key_map[key])
        elif action == "scroll":
            direction = payload.get("direction")
            if direction not in ("up", "down"):
                raise ValueError("Scroll direction must be up or down.")
            amount = max(1, min(8, int(payload.get("amount", 3))))
            pyautogui.scroll(amount if direction == "up" else -amount)
        elif action == "wait":
            time.sleep(1.0)
        elif action == "open_url":
            from urllib.parse import urlparse
            url = payload.get("url")
            parsed = urlparse(url or "")
            if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password:
                raise ValueError("Only HTTP/HTTPS URLs without embedded credentials are allowed.")
            webbrowser.open(url, new=2)
        else:
            raise ValueError("Unknown bridge action.")

        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


def main() -> None:
    raw = sys.stdin.readline()
    try:
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("Expected a JSON object.")
        result = respond(payload)
    except Exception as exc:
        result = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    print(json.dumps(result, separators=(",", ":")), flush=True)


if __name__ == "__main__":
    main()
