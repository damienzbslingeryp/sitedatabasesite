const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

// MongoDB подключение
const MONGODB_URI = 'mongodb://localhost:27017/site-manager';

// Схема сайта
const siteSchema = new mongoose.Schema({
    siteId: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    url: { type: String, default: '' },
    status: { 
        type: String, 
        enum: ['general', '2fa', 'good', 'archive'],
        default: 'general' 
    },
    comment: { type: String, default: '' },
    prefix: { type: String, default: '' },
    credentials: {
        login: { type: String, default: '' },
        password: { type: String, default: '' }
    },
    dateAdded: { type: Date, default: Date.now },
    lastModified: { type: Date, default: Date.now },
    modifiedBy: { type: String, default: 'system' }
});

const Site = mongoose.model('Site', siteSchema);

// Интерфейс для вопросов
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Улучшенная функция для извлечения институтов
function extractInstitutionsFromJSON(content) {
    const institutions = [];
    const seen = new Set();
    
    // Разбиваем контент на потенциальные JSON объекты
    // Ищем паттерн {"institution":{...}}
    const jsonPattern = /\{"institution":\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    const matches = content.match(jsonPattern) || [];
    
    console.log(`\n🔍 Найдено потенциальных JSON блоков: ${matches.length}`);
    
    for (const match of matches) {
        try {
            // Пытаемся найти нужные поля в каждом блоке
            const idMatch = match.match(/"id":(\d+)/);
            const nameMatch = match.match(/"name":"([^"]+)"/);
            const urlHomeMatch = match.match(/"urlHomeApp":"([^"]+)"/);
            const urlLogonMatch = match.match(/"urlLogonApp":"([^"]+)"/);
            
            if (idMatch && nameMatch) {
                const id = parseInt(idMatch[1]);
                
                // Проверяем на дубликаты
                if (!seen.has(id)) {
                    seen.add(id);
                    
                    const institution = {
                        id: id,
                        name: nameMatch[1],
                        url: urlHomeMatch ? urlHomeMatch[1] : (urlLogonMatch ? urlLogonMatch[1] : '')
                    };
                    
                    institutions.push(institution);
                }
            }
        } catch (e) {
            // Игнорируем ошибки парсинга отдельных блоков
        }
    }
    
    // Альтернативный метод - прямой поиск паттернов
    if (institutions.length === 0) {
        console.log('\n⚠️  Первый метод не сработал, пробуем альтернативный...');
        
        // Ищем все комбинации id, name и url
        const lines = content.split('\n');
        
        for (const line of lines) {
            const idMatch = line.match(/"id":(\d+)/);
            const nameMatch = line.match(/"name":"([^"]+)"/);
            const urlHomeMatch = line.match(/"urlHomeApp":"([^"]+)"/);
            const urlLogonMatch = line.match(/"urlLogonApp":"([^"]+)"/);
            
            if (idMatch && nameMatch) {
                const id = parseInt(idMatch[1]);
                
                if (!seen.has(id)) {
                    seen.add(id);
                    
                    institutions.push({
                        id: id,
                        name: nameMatch[1],
                        url: urlHomeMatch ? urlHomeMatch[1] : (urlLogonMatch ? urlLogonMatch[1] : '')
                    });
                }
            }
        }
    }
    
    return institutions;
}

async function main() {
    try {
        console.log('🔧 ИМПОРТ БАНКОВ С ПРАВИЛЬНЫМ ИЗВЛЕЧЕНИЕМ URL\n');
        
        // Подключение к MongoDB
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Подключено к MongoDB');

        // Проверяем текущее состояние
        const currentCount = await Site.countDocuments();
        console.log(`\n📊 Текущее количество записей: ${currentCount.toLocaleString()}`);

        // Проверяем наличие файла
        const filePath = path.join(__dirname, 'paste.txt');
        try {
            await fs.access(filePath);
            console.log('✅ Файл paste.txt найден');
        } catch {
            console.log('\n❌ Файл paste.txt не найден!');
            console.log('   Поместите файл в: ' + filePath);
            process.exit(1);
        }

        // Спрашиваем подтверждение
        console.log('\n⚠️  ВНИМАНИЕ: Все текущие данные будут УДАЛЕНЫ!');
        const answer = await question('Продолжить? (yes/no): ');
        
        if (answer.toLowerCase() !== 'yes') {
            console.log('❌ Операция отменена');
            process.exit(0);
        }

        // УДАЛЯЕМ ВСЕ ДАННЫЕ
        console.log('\n🗑️  Удаление всех данных...');
        await Site.deleteMany({});
        console.log('✅ База очищена');

        // Пересоздаем индексы
        console.log('\n🔨 Создание индексов...');
        await Site.collection.createIndex({ status: 1 });
        await Site.collection.createIndex({ status: 1, dateAdded: -1 });
        await Site.collection.createIndex({ siteId: 1 }, { unique: true });
        await Site.collection.createIndex({ name: 'text', url: 'text' });
        console.log('✅ Индексы созданы');

        // ЧИТАЕМ И ПАРСИМ ФАЙЛ
        console.log('\n📥 Чтение файла paste.txt...');
        const content = await fs.readFile(filePath, 'utf8');
        console.log(`📏 Размер файла: ${(content.length / 1024 / 1024).toFixed(2)} MB`);

        // Показываем пример содержимого
        console.log('\n📄 Пример содержимого файла:');
        console.log(content.substring(0, 500) + '...\n');

        // Извлекаем институты
        console.log('🔍 Извлечение институтов...');
        const institutions = extractInstitutionsFromJSON(content);
        console.log(`✅ Найдено уникальных институтов: ${institutions.length}`);

        if (institutions.length === 0) {
            console.log('\n❌ Не удалось найти институты в файле!');
            console.log('   Проверьте формат файла.');
            process.exit(1);
        }

        // Показываем примеры
        console.log('\n📋 Примеры найденных институтов:');
        const examples = institutions.slice(0, 10);
        examples.forEach((inst, i) => {
            console.log(`\n${i + 1}. ${inst.name}`);
            console.log(`   ID: ${inst.id}`);
            console.log(`   URL: ${inst.url || '❌ Не найден'}`);
        });

        // Статистика URL
        const withUrls = institutions.filter(inst => inst.url).length;
        console.log(`\n📊 Статистика URL:`);
        console.log(`   ✅ С URL: ${withUrls}`);
        console.log(`   ❌ Без URL: ${institutions.length - withUrls}`);

        const confirm = await question('\n📥 Начать импорт? (yes/no): ');
        if (confirm.toLowerCase() !== 'yes') {
            console.log('❌ Импорт отменен');
            process.exit(0);
        }

        // ИМПОРТИРУЕМ ДАННЫЕ
        console.log('\n📦 Импорт данных...');
        const batchSize = 500;
        let imported = 0;
        let errors = 0;
        
        for (let i = 0; i < institutions.length; i += batchSize) {
            const batch = institutions.slice(i, i + batchSize);
            
            const documents = batch.map(inst => ({
                siteId: inst.id,
                name: inst.name,
                url: inst.url || '',
                status: 'general',
                dateAdded: new Date(),
                lastModified: new Date()
            }));
            
            try {
                const result = await Site.insertMany(documents, { ordered: false });
                imported += result.length;
            } catch (error) {
                if (error.insertedDocs) {
                    imported += error.insertedDocs.length;
                }
                errors += batch.length - (error.insertedDocs ? error.insertedDocs.length : 0);
            }
            
            // Прогресс
            const progress = Math.round((i + batch.length) / institutions.length * 100);
            process.stdout.write(`\r⏳ Прогресс: ${progress}% (${imported} импортировано, ${errors} ошибок)`);
        }

        console.log('\n\n✅ Импорт завершен!');
        
        // Финальная статистика
        const finalCount = await Site.countDocuments();
        const finalWithUrls = await Site.countDocuments({ url: { $ne: '' } });
        
        console.log('\n📊 ИТОГОВАЯ СТАТИСТИКА:');
        console.log(`✅ Всего импортировано: ${finalCount.toLocaleString()}`);
        console.log(`🔗 С URL: ${finalWithUrls.toLocaleString()}`);
        console.log(`❌ Без URL: ${(finalCount - finalWithUrls).toLocaleString()}`);
        console.log(`⚠️  Ошибок: ${errors}`);
        
        // Проверяем конкретные примеры
        console.log('\n🔍 Проверка конкретных банков:');
        
        const testIds = [4200, 4173, 177723]; // ID из вашего примера
        for (const testId of testIds) {
            const bank = await Site.findOne({ siteId: testId });
            if (bank) {
                console.log(`\n✅ ID ${testId}: ${bank.name}`);
                console.log(`   URL: ${bank.url || '❌ Не указан'}`);
            } else {
                console.log(`\n❌ ID ${testId}: Не найден`);
            }
        }

        // Показываем случайные примеры с URL
        console.log('\n📋 Случайные банки с URL:');
        const randomWithUrl = await Site.aggregate([
            { $match: { url: { $ne: '' } } },
            { $sample: { size: 5 } }
        ]);
        
        randomWithUrl.forEach((site, i) => {
            console.log(`\n${i + 1}. ${site.name} (ID: ${site.siteId})`);
            console.log(`   URL: ${site.url}`);
        });

        console.log('\n✅ База данных успешно обновлена!');
        console.log('\n📌 Следующие шаги:');
        console.log('1. Перезапустите сервер: pm2 restart site-manager');
        console.log('2. Очистите кэш браузера (Ctrl+Shift+R)');
        console.log('3. Откройте сайт:');
        console.log('   - Через порт: http://77.91.70.191:3000');
        console.log('   - Или исправьте Socket.IO и откройте через nginx');
        
        rl.close();
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Критическая ошибка:', error);
        rl.close();
        process.exit(1);
    }
}

// Запуск
console.log('🚀 Запуск скрипта импорта банков\n');
main();
