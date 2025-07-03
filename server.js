const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// MongoDB подключение
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/site-manager';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ Подключено к MongoDB');
}).catch(err => {
    console.error('❌ Ошибка подключения к MongoDB:', err);
});

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

// Индексы для производительности
siteSchema.index({ status: 1 });
siteSchema.index({ status: 1, dateAdded: -1 });
siteSchema.index({ name: 'text', url: 'text' });

const Site = mongoose.model('Site', siteSchema);

// Схема префиксов
const prefixSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    color: { type: String, required: true }
});

const Prefix = mongoose.model('Prefix', prefixSchema);

// Инициализация префиксов по умолчанию
async function initializePrefixes() {
    const defaultPrefixes = [
        { name: 'Plaid', color: '#3498db' },
        { name: 'Finicity', color: '#27ae60' },
        { name: 'Yodlee', color: '#e74c3c' }
    ];

    try {
        for (const prefix of defaultPrefixes) {
            await Prefix.findOneAndUpdate(
                { name: prefix.name },
                prefix,
                { upsert: true, new: true }
            );
        }
        console.log('✅ Префиксы инициализированы');
    } catch (error) {
        console.error('❌ Ошибка инициализации префиксов:', error);
    }
}

initializePrefixes();

// Socket.IO для real-time обновлений
io.on('connection', (socket) => {
    console.log('👤 Новый пользователь подключен');
    
    // Отправляем текущие данные новому пользователю
    socket.emit('welcome', { message: 'Подключено к серверу' });

    socket.on('disconnect', () => {
        console.log('👤 Пользователь отключен');
    });
});

// Функция для уведомления всех клиентов
function notifyAllClients(event, data = {}) {
    io.emit(event, data);
}

// Кэш для статистики
let statsCache = null;
let statsCacheTime = 0;
const STATS_CACHE_TTL = 5000; // 5 секунд

// API маршруты

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Оптимизированный endpoint для получения сайтов с пагинацией
app.get('/api/sites/optimized', async (req, res) => {
    try {
        const { 
            status = 'general', 
            page = 1, 
            limit = 50,
            search = ''
        } = req.query;
        
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        
        // Строим запрос
        let query = { status };
        
        // Если есть поиск
        if (search) {
            query.$or = [
                { siteId: isNaN(search) ? -1 : parseInt(search) },
                { name: { $regex: search, $options: 'i' } },
                { url: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Получаем данные с пагинацией
        const [sites, total] = await Promise.all([
            Site.find(query)
                .sort({ dateAdded: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(), // lean() для производительности
            Site.countDocuments(query)
        ]);
        
        res.json({
            sites,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('Ошибка в optimized endpoint:', error);
        res.status(500).json({ error: error.message });
    }
});

// Оптимизированная статистика (с кэшированием)
app.get('/api/stats/cached', async (req, res) => {
    try {
        const now = Date.now();
        
        // Если кэш еще актуален
        if (statsCache && (now - statsCacheTime) < STATS_CACHE_TTL) {
            return res.json(statsCache);
        }
        
        // Обновляем кэш
        const stats = await Site.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        const result = {
            total: 0,
            general: 0,
            '2fa': 0,
            good: 0,
            archive: 0
        };
        
        stats.forEach(stat => {
            result[stat._id] = stat.count;
            result.total += stat.count;
        });
        
        statsCache = result;
        statsCacheTime = now;
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Минимальная загрузка для начального отображения
app.get('/api/sites/initial', async (req, res) => {
    try {
        const limit = 50; // Только первые 50 для быстрой загрузки
        
        const sites = await Site.find({ status: 'general' })
            .sort({ dateAdded: -1 })
            .limit(limit)
            .select('siteId name url status prefix comment credentials') // Только нужные поля
            .lean();
        
        res.json(sites);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Получить все сайты (старый endpoint для совместимости)
app.get('/api/sites', async (req, res) => {
    try {
        const sites = await Site.find().sort({ dateAdded: -1 }).lean();
        res.json(sites);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Добавить новые сайты из файла
app.post('/api/sites/import', async (req, res) => {
    try {
        const { content } = req.body;
        const results = { added: 0, duplicates: 0, errors: 0 };
        const newSites = [];

        // Используем регулярное выражение для поиска всех институтов
        const idPattern = /"id":(\d+),"name":"([^"]+)"/g;
        const matches = [];
        let match;
        
        while ((match = idPattern.exec(content)) !== null) {
            matches.push({
                id: parseInt(match[1]),
                name: match[2]
            });
        }

        // Проверяем уникальность по ID
        const uniqueInstitutions = new Map();
        matches.forEach(inst => {
            if (!uniqueInstitutions.has(inst.id)) {
                uniqueInstitutions.set(inst.id, inst);
            }
        });

        // Импортируем институты
        for (const inst of uniqueInstitutions.values()) {
            try {
                const exists = await Site.findOne({ siteId: inst.id });
                if (!exists) {
                    // Пытаемся найти URL
                    const idIndex = content.indexOf(`"id":${inst.id},`);
                    let url = '';
                    
                    if (idIndex !== -1) {
                        const searchArea = content.substring(idIndex, Math.min(idIndex + 2000, content.length));
                        const urlLogonMatch = searchArea.match(/"urlLogonApp":"([^"]+)"/);
                        if (urlLogonMatch) {
                            url = urlLogonMatch[1];
                        } else {
                            const urlHomeMatch = searchArea.match(/"urlHomeApp":"([^"]+)"/);
                            if (urlHomeMatch) {
                                url = urlHomeMatch[1];
                            }
                        }
                    }

                    const newSite = new Site({
                        siteId: inst.id,
                        name: inst.name,
                        url: url
                    });
                    
                    await newSite.save();
                    newSites.push(newSite);
                    results.added++;
                } else {
                    results.duplicates++;
                }
            } catch (e) {
                results.errors++;
            }
        }

        if (newSites.length > 0) {
            notifyAllClients('sitesUpdated', { action: 'import', count: newSites.length });
            // Сбрасываем кэш статистики
            statsCache = null;
        }

        res.json({ 
            success: true, 
            results,
            sites: newSites 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Обновить сайт
app.put('/api/sites/:id', async (req, res) => {
    try {
        const updates = {
            ...req.body,
            lastModified: new Date()
        };
        
        const site = await Site.findOneAndUpdate(
            { siteId: parseInt(req.params.id) },
            updates,
            { new: true }
        );
        
        if (!site) {
            return res.status(404).json({ error: 'Сайт не найден' });
        }
        
        notifyAllClients('siteUpdated', { site });
        statsCache = null; // Сброс кэша
        res.json(site);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Переместить сайт в другую категорию
app.put('/api/sites/:id/move', async (req, res) => {
    try {
        const { status } = req.body;
        const site = await Site.findOneAndUpdate(
            { siteId: parseInt(req.params.id) },
            { 
                status,
                lastModified: new Date()
            },
            { new: true }
        );
        
        if (!site) {
            return res.status(404).json({ error: 'Сайт не найден' });
        }
        
        notifyAllClients('siteUpdated', { site });
        statsCache = null; // Сброс кэша
        res.json(site);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Добавить комментарий
app.put('/api/sites/:id/comment', async (req, res) => {
    try {
        const { comment } = req.body;
        const site = await Site.findOneAndUpdate(
            { siteId: parseInt(req.params.id) },
            { 
                comment,
                lastModified: new Date()
            },
            { new: true }
        );
        
        if (!site) {
            return res.status(404).json({ error: 'Сайт не найден' });
        }
        
        notifyAllClients('siteUpdated', { site });
        res.json(site);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Добавить учетные данные
app.put('/api/sites/:id/credentials', async (req, res) => {
    try {
        const { login, password } = req.body;
        const site = await Site.findOneAndUpdate(
            { siteId: parseInt(req.params.id) },
            { 
                credentials: { login, password },
                lastModified: new Date()
            },
            { new: true }
        );
        
        if (!site) {
            return res.status(404).json({ error: 'Сайт не найден' });
        }
        
        notifyAllClients('siteUpdated', { site });
        res.json(site);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Добавить префикс
app.put('/api/sites/:id/prefix', async (req, res) => {
    try {
        const { prefix } = req.body;
        const site = await Site.findOneAndUpdate(
            { siteId: parseInt(req.params.id) },
            { 
                prefix,
                lastModified: new Date()
            },
            { new: true }
        );
        
        if (!site) {
            return res.status(404).json({ error: 'Сайт не найден' });
        }
        
        notifyAllClients('siteUpdated', { site });
        res.json(site);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Получить все префиксы
app.get('/api/prefixes', async (req, res) => {
    try {
        const prefixes = await Prefix.find();
        res.json(prefixes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Добавить префикс
app.post('/api/prefixes', async (req, res) => {
    try {
        const { name, color } = req.body;
        const prefix = new Prefix({ name, color });
        await prefix.save();
        
        notifyAllClients('prefixesUpdated');
        res.json(prefix);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Обновить префикс
app.put('/api/prefixes/:oldName', async (req, res) => {
    try {
        const { name, color } = req.body;
        const oldName = req.params.oldName;
        
        // Обновляем префикс
        await Prefix.findOneAndUpdate(
            { name: oldName },
            { name, color }
        );
        
        // Обновляем префикс у всех сайтов
        if (oldName !== name) {
            await Site.updateMany(
                { prefix: oldName },
                { prefix: name }
            );
        }
        
        notifyAllClients('prefixesUpdated');
        notifyAllClients('sitesUpdated');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Удалить префикс
app.delete('/api/prefixes/:name', async (req, res) => {
    try {
        await Prefix.deleteOne({ name: req.params.name });
        
        // Убрать префикс у всех сайтов
        await Site.updateMany(
            { prefix: req.params.name },
            { prefix: '' }
        );
        
        notifyAllClients('prefixesUpdated');
        notifyAllClients('sitesUpdated');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Получить статистику (старый endpoint)
app.get('/api/stats', async (req, res) => {
    try {
        const stats = {
            total: await Site.countDocuments(),
            general: await Site.countDocuments({ status: 'general' }),
            '2fa': await Site.countDocuments({ status: '2fa' }),
            good: await Site.countDocuments({ status: 'good' }),
            archive: await Site.countDocuments({ status: 'archive' })
        };
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Что-то пошло не так!' });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📍 Откройте http://localhost:${PORT} в браузере`);
});