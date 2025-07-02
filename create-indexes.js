const mongoose = require('mongoose');

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

async function createIndexes() {
    try {
        // Подключение к MongoDB
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Подключено к MongoDB');
        
        // Создаем индексы
        console.log('🔨 Создание индексов...');
        
        // Индекс по статусу (для фильтрации по вкладкам)
        await Site.collection.createIndex({ status: 1 });
        console.log('✅ Индекс по статусу создан');
        
        // Индекс по siteId уже существует из-за unique: true в схеме
        console.log('✅ Индекс по siteId уже существует (unique)');
        
        // Составной текстовый индекс для поиска
        await Site.collection.createIndex({ name: 'text', url: 'text' });
        console.log('✅ Текстовый индекс создан');
        
        // Индекс по дате для сортировки
        await Site.collection.createIndex({ dateAdded: -1 });
        console.log('✅ Индекс по дате создан');
        
        // Составной индекс для комбинированных запросов
        await Site.collection.createIndex({ status: 1, dateAdded: -1 });
        console.log('✅ Составной индекс создан');
        
        // Проверяем все индексы
        const indexes = await Site.collection.getIndexes();
        console.log('\n📊 Все индексы:');
        Object.keys(indexes).forEach(key => {
            console.log(`   - ${key}`);
        });
        
        console.log('\n✅ Все индексы успешно созданы!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка:', error);
        process.exit(1);
    }
}

// Запускаем создание индексов
createIndexes();