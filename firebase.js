// firebase.js
// -------- ИМПОРТЫ SDK --------
import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";

import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    increment,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";


// -------- КОНФИГ ТВОЕГО ПРОЕКТА --------
const firebaseConfig = {
    apiKey: "AIzaSyAzRjvFDkmmL509Z3ytx9Dibl4WE9cF3s0",
    authDomain: "mysorstat.firebaseapp.com",
    projectId: "mysorstat",
    storageBucket: "mysorstat.firebasestorage.app",
    messagingSenderId: "672693845408",
    appId: "1:672693845408:web:ecbb22b9b857aa2be2f8c5",
    measurementId: "G-Z9S58B91BP"
};

// -------- ИНИЦИАЛИЗАЦИЯ --------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
export { db };

console.log("🔥 Firebase подключён");


// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

// делаем id документа из имени (чтобы "Владислав" и "владислав" были одним пользователем)
function normalizeName(name) {
    return name.toLowerCase().trim();
}


// ===== СЛОВА ДЛЯ WELCOME-ТЕКСТА =====
const titles = [
    "Welcome!",
    "Добро пожаловать!",
    "Bienvenue!",
    "Willkommen!",
    "¡Bienvenido!",
    "Benvenuto!"
];

const titleEl = document.getElementById("welcomeTitle");
let titleIndex = 0;

// плавная анимация появления/исчезновения текста
function animateTitleCycle() {
    if (!titleEl) return;

    titleEl.textContent = titles[titleIndex];

    // гарантируем, что текст всегда помещается в блок
    titleEl.style.fontSize = "72px";
    while (titleEl.scrollWidth > titleEl.clientWidth && parseInt(titleEl.style.fontSize) > 32) {
        titleEl.style.fontSize = (parseInt(titleEl.style.fontSize) - 2) + "px";
    }

    // появление
    titleEl.style.animation = "fadeIn 1.6s forwards";

    // пауза 2 секунды и исчезновение
    setTimeout(() => {
        titleEl.style.animation = "fadeOut 1.6s forwards";
    }, 2000);

    // смена текста и повтор цикла
    setTimeout(() => {
        titleIndex = (titleIndex + 1) % titles.length;
        animateTitleCycle();
    }, 3600);
}

if (titleEl) {
    animateTitleCycle();
}


// ===== РАБОТА С ПОЛЬЗОВАТЕЛЕМ =====

// создаёт пользователя, если его ещё нет
// ===== СОЗДАНИЕ ПОЛЬЗОВАТЕЛЯ, ЕСЛИ ЕГО НЕТ =====
async function createUserIfNotExists(name) {
    const id = normalizeName(name);
    const userRef = doc(db, "users", id);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
        const now = Date.now();

        await setDoc(userRef, {
            name: name.trim(),
            scans: 0,          // общее количество сканов
            createdAt: now,
            lastUpdated: now,
            materials: {},     // сюда будем накапливать: { "пластик": 3, "стекло": 2, ... }
            itemsCount: {},    // сюда: { "банка": 5, "бутылка": 2, ... }
            items: []          // список последних сканов (для истории)
        });

        console.log("✅ Создан новый пользователь:", name);
    } else {
        console.log("ℹ Пользователь уже существует:", name);
    }

    return userRef;
}


// обработчик клика по кнопке "Начать"
async function handleSaveName() {
    const input = document.getElementById("username-input");
    if (!input) return;

    const name = input.value.trim();
    if (!name) {
        alert("Введите имя!");
        return;
    }

    try {
        // создаём пользователя в базе
        await createUserIfNotExists(name);

        // сохраняем имя локально для дальнейших действий
        localStorage.setItem("username", name);

        // плавно прячем welcome-экран
        const overlay = document.getElementById("welcome-overlay");
        if (overlay) {
            overlay.style.opacity = "0";
            setTimeout(() => {
                overlay.style.display = "none";
            }, 600);
        }

        console.log("👤 Пользователь сохранён и выбран:", name);
    } catch (err) {
        console.error("Ошибка сохранения пользователя:", err);
        alert("Не удалось сохранить пользователя. Проверь соединение.");
    }
}

// делаем функцию доступной для HTML-кнопки
window.saveName = handleSaveName;


// ===== ДОБАВЛЕНИЕ СКАНА ДЛЯ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ =====

/**
 * Добавляет информацию о выброшенном предмете
 * и увеличивает счётчик scans у текущего пользователя.
 *
 * Пример вызова:
 *   addScanForCurrentUser({
 *      item: "Алюминиевая банка",
 *      material: "металл",
 *      container: "⚪ металлический контейнер"
 *   });
 */
// ===== ДОБАВЛЕНИЕ СКАНА ДЛЯ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ =====
async function addScanForCurrentUser(scanData) {
    const username = localStorage.getItem("username");
    if (!username) {
        console.warn("Нет текущего пользователя (username в localStorage).");
        return;
    }

    const id = normalizeName(username);
    const userRef = doc(db, "users", id);

    // Нормализуем данные скана
    const rawItem     = (scanData.item || "Неизвестный предмет").trim();
    const rawMaterial = (scanData.material || "другое").trim();
    const container   = (scanData.container || "не указан").trim();

    // Ключи для статистики
    const materialKey = rawMaterial.toLowerCase();   // "Пластик" -> "пластик"
    const itemKey     = rawItem.toLowerCase();       // "Банка колы" -> "банка колы"

    const now = Date.now();

    try {
        // Основное обновление документа
        await updateDoc(userRef, {
            // общее количество сканов
            scans: increment(1),

            // время последнего скана
            lastUpdated: now,

            // накапливаем статистику по материалам:
            // materials.пластик: +1, materials.стекло: +1 и т.д.
            [`materials.${materialKey}`]: increment(1),

            // накапливаем статистику по предметам:
            // itemsCount["банка энергетика"]: +1
            [`itemsCount.${itemKey}`]: increment(1),

            // добавляем запись в историю сканов
            items: arrayUnion({
                item: rawItem,
                material: rawMaterial,
                container,
                createdAt: now
            })
        });

        console.log("✅ Скан добавлен пользователю:", id, {
            item: rawItem,
            material: rawMaterial,
            container
        });

    } catch (err) {
        console.error("⚠ Ошибка updateDoc, пробую создать документ/слить данные:", err);

        // на случай, если документа ещё нет или структура другая — аккуратно создаём/обновляем
        const fallbackData = {
            name: username.trim(),
            scans: 1,
            createdAt: now,
            lastUpdated: now,
            materials: { [materialKey]: 1 },
            itemsCount: { [itemKey]: 1 },
            items: [{
                item: rawItem,
                material: rawMaterial,
                container,
                createdAt: now
            }]
        };

        // merge: true — чтобы не стереть другие поля, если они уже есть
        await setDoc(userRef, fallbackData, { merge: true });

        console.log("✅ Документ пользователя был создан/обновлён через fallback:", id);
    }
}

// Делаем функцию доступной из других файлов и из result.html
window.addScanForCurrentUser = addScanForCurrentUser;

// тоже кидаем на window, чтобы можно было вызвать из других страниц
window.addEventListener("DOMContentLoaded", () => {
    window.addScanForCurrentUser = addScanForCurrentUser;
    window.saveName = handleSaveName;
});
