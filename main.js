const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { Command } = require('commander');
const superagent = require('superagent');

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

async function readRequestBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function sendText(res, statusCode, message, extraHeaders = {}) {
    res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        ...extraHeaders,
    });
    res.end(message);
}

function sendImage(res, statusCode, imageBuffer, cacheStatus) {
    res.writeHead(statusCode, {
        'Content-Type': 'image/jpeg',
        'Content-Length': imageBuffer.length,
        'X-Cache': cacheStatus,
    });
    res.end(imageBuffer);
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

            const filePath = path.join(cacheDir, `${code}.jpg`);

            switch (req.method) {
                case 'GET': {
                    try {
                        const cachedImage = await fs.readFile(filePath);
                        sendImage(res, 200, cachedImage, 'HIT');
                    } catch (readErr) {
                        if (readErr.code !== 'ENOENT') {
                            throw readErr;
                        }

                        try {
                            const response = await superagent
                                .get(`https://http.cat/${code}`)
                                .buffer(true);

                            const imageBuffer = response.body;
                            await fs.writeFile(filePath, imageBuffer);
                            sendImage(res, 200, imageBuffer, 'MISS');
                        } catch (_fetchErr) {
                            sendText(res, 404, `Not Found: картинку для коду ${code} не знайдено.`);
                        }
                    }
                    break;
                }

                case 'PUT': {
                    const bodyBuffer = await readRequestBody(req);
                    if (bodyBuffer.length === 0) {
                        sendText(res, 400, 'Bad Request: тіло PUT-запиту не може бути порожнім.');
                        return;
                    }

                    await fs.writeFile(filePath, bodyBuffer);
                    sendText(res, 201, `Created: картинку для коду ${code} збережено в кеш.`);
                    break;
                }

                case 'DELETE': {
                    try {
                        await fs.unlink(filePath);
                        sendText(res, 200, `OK: картинку для коду ${code} видалено з кешу.`);
                    } catch (unlinkErr) {
                        if (unlinkErr.code === 'ENOENT') {
                            sendText(res, 404, `Not Found: картинка для коду ${code} відсутня в кеші.`);
                        } else {
                            throw unlinkErr;
                        }
                    }
                    break;
                }

                default: {
                    sendText(res, 405, `Method Not Allowed: метод ${req.method} не підтримується.`, {
                        Allow: 'GET, PUT, DELETE',
                    });
                    break;
                }
            }
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