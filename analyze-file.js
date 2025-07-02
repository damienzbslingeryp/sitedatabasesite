const fs = require('fs');

// Читаем файл
const content = fs.readFileSync('paste.txt', 'utf8');

console.log('📏 Размер файла:', content.length, 'символов');
console.log('📄 Первые 500 символов:');
console.log(content.substring(0, 500));
console.log('\n---\n');

// Ищем все вхождения "institution":{"id":
const idMatches = content.match(/"institution":\{"id":\d+/g);
if (idMatches) {
    console.log('🔍 Найдено институтов по паттерну "institution":{"id":', idMatches.length);
    console.log('📋 Первые 5 ID:');
    idMatches.slice(0, 5).forEach(match => {
        const id = match.match(/\d+/)[0];
        console.log('  - ID:', id);
    });
}

// Альтернативный поиск
const altMatches = content.match(/\{"institution":\{/g);
if (altMatches) {
    console.log('\n🔍 Найдено вхождений {"institution":{:', altMatches.length);
}

// Проверяем структуру
console.log('\n📊 Анализ структуры:');
const lines = content.split('\n');
console.log('📝 Количество строк:', lines.length);

// Проверяем первую строку
if (lines[0]) {
    console.log('\n🔍 Анализ первой строки:');
    console.log('Длина:', lines[0].length);
    console.log('Начало:', lines[0].substring(0, 100));
    
    // Пытаемся найти конец первого объекта
    let depth = 0;
    let inString = false;
    let escape = false;
    
    for (let i = 0; i < lines[0].length && i < 5000; i++) {
        const char = lines[0][i];
        
        if (!escape) {
            if (char === '"' && !inString) inString = true;
            else if (char === '"' && inString) inString = false;
            else if (!inString) {
                if (char === '{') depth++;
                else if (char === '}') {
                    depth--;
                    if (depth === 0) {
                        console.log('🎯 Первый полный JSON объект заканчивается на позиции:', i);
                        console.log('📋 Конец первого объекта:', lines[0].substring(i-20, i+1));
                        break;
                    }
                }
            }
            escape = (char === '\\');
        } else {
            escape = false;
        }
    }
}
