const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

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

async function importData() {
    try {
        // Подключение к MongoDB
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Подключено к MongoDB');

        // Проверяем текущее количество записей
        const initialCount = await Site.countDocuments();
        console.log(`📊 Записей в БД до импорта: ${initialCount}`);

        // Читаем файл
        const filePath = path.join(__dirname, 'paste.txt');
        console.log(`📂 Читаю файл: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf8');
        
        console.log('🔍 Извлекаю данные институтов...');
        
        // Используем проверенный метод для извлечения ID и названий
        const idPattern = /"id":(\d+),"name":"([^"]+)"/g;
        const institutions = new Map();
        let match;
        
        while ((match = idPattern.exec(content)) !== null) {
            const id = parseInt(match[1]);
            const name = match[2];
            
            if (!institutions.has(id)) {
                institutions.set(id, { id, name, url: '' });
            }
        }
        
        console.log(`📊 Найдено уникальных институтов: ${institutions.size}`);
        
        // Конвертируем в массив
        const institutionsArray = Array.from(institutions.values());
        
        console.log(`\n🚀 Начинаю импорт...`);
        console.log('💡 Прогресс будет показываться каждые 10 записей\n');
        
        const results = {
            added: 0,
            duplicates: 0,
            errors: 0
        };
        
        const startTime = Date.now();
        let processed = 0;
        
        // Обрабатываем пакетами для лучшей производительности
        const batchSize = 100;
        
        for (let i = 0; i < institutionsArray.length; i += batchSize) {
            const batch = institutionsArray.slice(i, i + batchSize);
            
            for (const inst of batch) {
                try {
                    processed++;
                    
                    // Показываем прогресс каждые 10 записей в начале, потом реже
                    if (processed <= 100 && processed % 10 === 0) {
                        console.log(`⏳ Обработано: ${processed}/${institutionsArray.length}`);
                    } else if (processed % 100 === 0) {
                        const elapsed = (Date.now() - startTime) / 1000;
                        const rate = processed / elapsed;
                        const percent = Math.round(processed/institutionsArray.length*100);
                        console.log(`⏳ Прогресс: ${processed}/${institutionsArray.length} (${percent}%) - Скорость: ${Math.round(rate)} записей/сек`);
                    }
                    
                    // Быстрая проверка существования
                    const exists = await Site.exists({ siteId: inst.id });
                    
                    if (!exists) {
                        await Site.create({
                            siteId: inst.id,
                            name: inst.name,
                            url: ''
                        });
                        results.added++;
                        
                        // Показываем первые добавленные
                        if (results.added <= 3) {
                            console.log(`✅ Добавлен: "${inst.name}" (ID: ${inst.id})`);
                        }
                    } else {
                        results.duplicates++;
                    }
                } catch (error) {
                    results.errors++;
                    if (results.errors <= 3) {
                        console.error(`❌ Ошибка ID ${inst.id}: ${error.message}`);
                    }
                }
            }
            
            // Пауза между пакетами для снижения нагрузки
            if (i + batchSize < institutionsArray.length) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        
        const totalTime = (Date.now() - startTime) / 1000;
        const finalCount = await Site.countDocuments();
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 РЕЗУЛЬТАТЫ ИМПОРТА:');
        console.log('='.repeat(50));
        console.log(`✅ Добавлено новых: ${results.added}`);
        console.log(`⚠️  Пропущено дубликатов: ${results.duplicates}`);
        console.log(`❌ Ошибок: ${results.errors}`);
        console.log(`📈 Всего записей в БД: ${finalCount} (было ${initialCount})`);
        console.log(`⏱️  Время выполнения: ${Math.round(totalTime)} сек`);
        console.log('='.repeat(50));
        
        console.log('\n✅ Импорт завершен!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
        process.exit(1);
    }
}

// Запускаем
console.log('🚀 Запуск импорта с улучшенным отображением прогресса\n');
importData();
