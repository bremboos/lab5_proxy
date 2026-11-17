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

async function startServer() {
    try {
        await fs.mkdir(cacheDir, { recursive: true });
        console.log(`Теку кешу підготовлено: ${cacheDir}`);
        console.log(`Параметри запуску: host=${host}, port=${port}`);
    } catch (err) {
        console.error(`Не вдалося створити теку кешу "${cacheDir}":`, err.message);
        process.exit(1);
    }
}

startServer();