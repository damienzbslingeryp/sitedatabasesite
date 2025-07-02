const fs = require('fs');

// Читаем файл
const content = fs.readFileSync('paste.txt', 'utf8');

console.log('📄 Анализ файла paste.txt\n');

// Метод 1: Поиск по регулярному выражению
console.log('🔍 Метод 1: Поиск ID и имен через регулярные выражения');
const idPattern = /"id":(\d+),"name":"([^"]+)"/g;
let match;
let count = 0;

while ((match = idPattern.exec(content)) !== null) {
    count++;
    console.log(`   ${count}. ID: ${match[1]}, Name: ${match[2]}`);
}

console.log(`\n📊 Найдено записей методом 1: ${count}`);

// Метод 2: Поиск URL
console.log('\n🔍 Метод 2: Поиск URL');
const urlPattern = /"urlLogonApp":"([^"]+)"/g;
const urls = [];
while ((match = urlPattern.exec(content)) !== null) {
    urls.push(match[1]);
}
console.log(`📊 Найдено URL: ${urls.length}`);
urls.slice(0, 5).forEach((url, i) => {
    console.log(`   ${i + 1}. ${url}`);
});

// Метод 3: Простой поиск институтов
console.log('\n🔍 Метод 3: Извлечение данных институтов');
const institutions = [];

// Ищем все паттерны "institution":{"id":число,"name":"имя"
const instPattern = /"institution":\{"id":(\d+),"name":"([^"]+)"[^}]*"urlLogonApp":"([^"]*)"[^}]*"urlHomeApp":"([^"]*)"/g;

while ((match = instPattern.exec(content)) !== null) {
    institutions.push({
        id: parseInt(match[1]),
        name: match[2],
        urlLogon: match[3],
        urlHome: match[4],
        url: match[3] || match[4]
    });
}

console.log(`\n📊 Извлечено институтов: ${institutions.length}`);
console.log('\n📋 Список институтов:');
institutions.forEach((inst, i) => {
    console.log(`\n${i + 1}. ${inst.name}`);
    console.log(`   ID: ${inst.id}`);
    console.log(`   URL: ${inst.url || 'Не указан'}`);
});

// Сохраняем результат для проверки
const output = {
    totalFound: institutions.length,
    institutions: institutions
};

fs.writeFileSync('parsed-institutions.json', JSON.stringify(output, null, 2));
console.log('\n💾 Результаты сохранены в parsed-institutions.json');
