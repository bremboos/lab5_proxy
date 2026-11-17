const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { Command } = require('commander');

const program = new Command();

program
    .helpOption('--help', 'показати довідку')
    .requiredOption('-h, --host <address>', 'адреса, на якій працює сервер')
    .requiredOption('-p, --port <number>', 'порт сервера')
    .requiredOption('-c, --cache <path>', 'шлях до теки, у якій зберігаються кешовані картинки');

program.parse(process.argv);

const options = program.opts();
const host = options.host;
const port = Number(options.port);
const cacheDir = path.resolve(options.cache);

if (Number.isNaN(port) || port <= 0 || port > 65535) {
    console.error('Помилка: параметр --port має бути коректним номером порту (1–65535).');
    process.exit(1);
}

function sendText(res, statusCode, message, extraHeaders = {}) {
    res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        ...extraHeaders,
    });
    res.end(message);
}

function extractStatusCode(rawUrl) {
    const parsedUrl = new URL(rawUrl, `http://${host}:${port}`);
    const match = /^\/(\d{3})$/.exec(parsedUrl.pathname);
    return match ? match[1] : null;
}

async function startServer() {
    try {
        await fs.mkdir(cacheDir, { recursive: true });
    } catch (err) {
        console.error(`Не вдалося створити теку кешу "${cacheDir}":`, err.message);
        process.exit(1);
    }

    const server = http.createServer(async (req, res) => {
        try {
            const code = extractStatusCode(req.url);

            if (!code) {
                sendText(res, 404, 'Not Found: вкажіть коректний тризначний HTTP-код у шляху (наприклад, /200).');
                return;
            }

            sendText(res, 200, `Сервер працює. Отримано валідний код: ${code}`);
        } catch (err) {
            console.error('Внутрішня помилка сервера:', err);
            if (!res.headersSent) {
                sendText(res, 500, 'Internal Server Error: сталася непередбачена помилка сервера.');
            }
        }
    });

    server.listen(port, host);
    console.log(`Проксі-сервер запущено на http://${host}:${port} (кеш: ${cacheDir})`);
}

startServer();