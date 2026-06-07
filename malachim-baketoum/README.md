# 🟠 מלאכים בכתום — מערכת ניהול מתנדבים

מערכת ניהול מתנדבים לאיחוד הצלה. Phase 1 — סניף חריש.

---

## הגדרה ראשונית

### 1. יצירת פרויקט Firebase

1. גש ל-https://console.firebase.google.com
2. צור פרויקט חדש
3. הפעל **Authentication** → Sign-in method → **Email/Password**
4. הפעל **Firestore Database** → בחר אזור (europe-west3 מומלץ)
5. הפעל **Hosting**

### 2. הגדרת Firebase בקוד

1. Firebase console → Project Settings → Your apps → Web app → Add app
2. העתק את ה-firebaseConfig
3. עדכן `src/firebase/config.js`:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "...",
  appId: "..."
}
```

4. עדכן `.firebaserc`:

```json
{ "projects": { "default": "your-project-id" } }
```

### 3. Deploy כללי Firestore

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes
```

### 4. גיבוי ושחזור Firestore

#### גיבוי

מייצא את כל האוספים לקובץ JSON מתויג בתאריך בתיקיית `backups/`:

```bash
node scripts/backup.js
```

קובץ לדוגמה: `backups/backup-2024-01-01-12-00.json`

> תיקיית `backups/` נכללת ב-`.gitignore` — אל תעלה גיבויים ל-Git.

#### שחזור

```bash
# שחזור רגיל — מדלג על מסמכים קיימים
node scripts/restore.js backups/backup-2024-01-01-12-00.json

# בדיקה ללא כתיבה בפועל
node scripts/restore.js backups/backup-2024-01-01-12-00.json --dry-run

# דריסת מסמכים קיימים
node scripts/restore.js backups/backup-2024-01-01-12-00.json --overwrite
```

> שני הסקריפטים דורשים `serviceAccount.json` בתיקייה הראשית (ראה שלב 1 בהגדרות).

#### גיבוי שבועי אוטומטי — Windows Task Scheduler

1. פתח **Task Scheduler** (חפש בתפריט התחל)
2. לחץ **Create Basic Task...**
3. שם: `Malachim Firestore Backup`
4. Trigger: **Weekly** → בחר יום ושעה (למשל ראשון 03:00)
5. Action: **Start a program**
   - Program: `node`
   - Arguments: `scripts/backup.js`
   - Start in: `C:\Users\להב\Desktop\New folder clod\malachim-baketoum`
6. סיים ולחץ **Finish**

> ודא ש-`node` מוגדר ב-PATH של Windows (הרץ `node --version` ב-PowerShell לבדיקה).

לחלופין, הרץ ישירות מ-PowerShell עם Task Scheduler XML:

```powershell
schtasks /create /tn "Malachim Backup" /tr "node \"C:\Users\להב\Desktop\New folder clod\malachim-baketoum\scripts\backup.js\"" /sc weekly /d MON /st 03:00
```

#### העלאה ידנית ל-Google Drive

לאחר הרצת גיבוי:

1. פתח את [Google Drive](https://drive.google.com)
2. צור תיקייה: `Malachim Backups`
3. גרור את הקובץ מ-`backups/backup-YYYY-MM-DD-HH-mm.json` לתיקייה
4. מומלץ: שנה שם ל-`backup-YYYY-MM-DD.json` לנוחות

> טיפ: הגדר שיתוף מוגבל לדוא"ל הארגוני בלבד לאבטחת הנתונים.

---

### 5. הרצת Seed Data

```bash
npm install firebase-admin
# הורד service account key: Firebase console → Project Settings → Service Accounts
# Windows PowerShell:
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccount.json"
node scripts/seed.js
```

### 5. הרצה מקומית

```bash
npm install
npm run dev
```

### 6. Deploy לאירוח

```bash
npm run build
firebase deploy --only hosting
```

---

## פרטי כניסה ראשוניים (Seed)

| שם | תעודת זהות | קוד כונן | תפקיד |
|---|---|---|---|
| מנהל מערכת | 000000001 | admin123 | system_admin |
| ראש סניף | 000000002 | head123 | branch_head |
| מוקדן ראשי | 000000003 | disp123 | dispatcher |
| ישראל ישראלי | 000000004 | vol1123 | volunteer |
| שרה כהן | 000000005 | vol2123 | volunteer |
| דוד לוי | 000000006 | vol3123 | volunteer |

---

## הוספת system_admin ראשון ידנית

1. Firebase Authentication → Add user → Email: `000000001@malachim.co.il` | Password: `admin123`
2. העתק את ה-UID
3. Firestore → אוסף `users` → צור מסמך עם ה-UID:

```json
{
  "firstName": "מנהל",
  "lastName": "מערכת",
  "idNumber": "000000001",
  "branchId": "harish",
  "role": "system_admin",
  "isActive": true,
  "nightShifts": false,
  "shabbatVolunteer": false
}
```

---

## פורמט CSV לייבוא מתנדבים

```
firstName,lastName,idNumber,volunteerId,phone
ישראל,ישראלי,123456789,1234,050-1234567
```

---

## הוספת סניף חדש

1. כנס כ-system_admin
2. עבור לדף "כל הסניפים" ← "סניף חדש"
3. הזן שם ועיר
4. הוסף ראש סניף דרך ניהול המשתמשים

---

## מבנה הנתונים

```
branches/{branchId}          — סניפים
users/{userId}               — משתמשים, תפקידים, הרשאות
night_shifts/{shiftId}       — שיבוצי לילה
shabbat_shifts/{shiftId}     — תורני שבת
building_codes/{codeId}      — קודי בניין
lottery_results/{resultId}   — תוצאות הגרלות
```

---

## Stack

- **Frontend**: React + Vite + Tailwind CSS v4
- **Auth**: Firebase Authentication (Email/Password)
- **Database**: Firestore
- **Hosting**: Firebase Hosting
- **Packages**: firebase, react-router-dom, date-fns, canvas-confetti, xlsx

---

*מלאכים בכתום — כי כל שנייה חשובה* 🟠
