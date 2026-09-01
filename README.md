# Vonalzó+

Egy napló **tanároknak** – az [ujkreta](https://github.com/puspus-dev/ujkreta) (eKRÁTA-kompatibilis) API-ra átírva.

<sub>_Eredetileg a Coware-Apps Napló+ projektjén alapult._</sub>

## API



### Autentikáció
- `POST /connect/token` (password + refresh_token grant)

### Olvasás (GET)
| Endpoint | Leírás |
|----------|--------|
| `/naplo/v3/sajat/TanarAdatlap` | Tanár profil |
| `/naplo/v3/sajat/OsztalyCsoportok` | Osztályok |
| `/naplo/v3/sajat/Tanulok` | Diákok |
| `/naplo/v3/sajat/OrarendElemek` | Órarend |
| `/naplo/v3/sajat/Ertekelesek` | Értékelések |
| `/naplo/v3/sajat/HaziFeladatok` | Házi feladatok |
| `/naplo/v3/sajat/Mulasztasok` | Mulasztások |
| `/naplo/v3/sajat/BejelentettSzamonkeresek` | Számonkérések |

### Írás (POST)
| Endpoint | Leírás |
|----------|--------|
| `/naplo/v3/sajat/Ertekelesek` | Új értékelés |
| `/naplo/v3/sajat/HaziFeladatok` | Új házi |
| `/naplo/v3/sajat/Mulasztasok` | Új mulasztás |
| `/naplo/v3/sajat/BejelentettSzamonkeresek` | Új számonkérés |


## Fejlesztés

```bash
npm install
ionic serve
```

A régi e-KRÉTA Napló v2 API-ról (`/Naplo/v2/...`) át lett írva a modern `/naplo/v3/sajat/*` struktúrára.
Az UI változatlan maradt, csak az API réteg lett cserélve.
