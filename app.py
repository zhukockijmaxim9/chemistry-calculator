import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from model import MODEL, solve


WEB_DIRECTORY = Path(__file__).resolve().parent / "web"
MAX_REQUEST_SIZE = 16_384


class RequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/model":
            self.send_json(200, MODEL)
            return

        super().do_GET()

    def do_POST(self):
        if self.path != "/api/calculate":
            self.send_json(404, {"error": "Такого адреса нет."})
            return

        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= MAX_REQUEST_SIZE:
                raise ValueError("Некорректный размер запроса.")
            raw = self.rfile.read(size)
            result = solve(json.loads(raw))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {"error": "Не удалось прочитать данные формы."})
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
        except RuntimeError as error:
            self.send_json(422, {"error": str(error)})
        else:
            self.send_json(200, result)

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    address = ("127.0.0.1", 8000)
    handler = partial(RequestHandler, directory=WEB_DIRECTORY)

    with ThreadingHTTPServer(address, handler) as server:
        print(f"http://{address[0]}:{address[1]}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
