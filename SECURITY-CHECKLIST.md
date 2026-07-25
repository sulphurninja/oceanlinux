# Security Checklist — Deploy Se Pehle

## Ye kyun karna hai

Aapki `.env` file GitHub par public repo mein thi. Repo private karne se purani history saaf nahi hoti — jisne pehle clone kar liya, uske paas ye saari keys **ab bhi** hain.

Ghar ki chaabi kho jaaye to naya taala lagate hain. Waise hi ye saari keys badalni hain.

**Zaroori baat:** MongoDB ka password leaked hai. Iska matlab koi seedha aapke database se juda sakta hai aur code ke saare protections bypass ho jaate hain. Is liye Level 1 sabse pehle karo.

---

---

## LEVEL 0 — Sabse pehle ye karo (warna baaki mehnat bekaar jayegi)

`.env` file abhi bhi git mein **tracked** hai. `.gitignore` mein `.env` likha hua hai, par wo kaam nahi karta — git ek baar jo file track kar leta hai, use `.gitignore` se ignore nahi karta.

Iska matlab: aap nayi keys daaloge, phir jab bhi commit karoge, wo **nayi keys phir se repo mein chali jayengi**.

- [ ] Pehle `.env` ko git se hatao (file aapke computer par bani rahegi, sirf git use track karna band karega):

  ```bash
  git rm --cached .env
  ```

- [ ] Confirm karo ki ab wo ignore ho rahi hai. Output mein `.env` aana chahiye:

  ```bash
  git check-ignore .env
  ```

- [ ] Phir commit karo:

  ```bash
  git commit -m "Stop tracking .env"
  ```

**Ye step pehla karo, keys badalne se pehle.**

---

## Naya secret kaise banaye

Jahan likha hai "naya khud banao", wahan ye command chalao. Jo lamba text aaye, wahi paste kar do:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## LEVEL 1 — Aaj hi karo (sabse khatarnaak)

- [ ] **`MONGOOSE_URL`** — MongoDB Atlas mein jaake database user ka password badlo, phir nayi connection string `.env` mein daalo.
  - Kahan: MongoDB Atlas → Database Access → user `aditya` → Edit → Edit Password
  - Note: abhi password `adityaaditya` hai, jo bahut kamzor hai. Naya lamba random password rakho.
  - **Khatra:** koi bhi aapka poora database padh/badal sakta hai — orders, customers, wallet balance, sab.

- [ ] **`ADMIN_PANEL_PASSWORD`** — naya password khud sochkar daalo (lamba rakho).
  - **Khatra:** leaked password se koi seedha aapke admin panel mein ghus sakta hai.

- [ ] **`TOKEN_SECRET`** — naya khud banao (upar wali command se).
  - **Khatra:** isse kisi bhi user ka login banaya ja sakta hai — admin ka bhi.
  - Note: badalne ke baad saare logged-in users ko dobara login karna padega. Ye normal hai.

---

## LEVEL 2 — Paise se juda

- [ ] **`RAZORPAY_KEY_SECRET`** (aur `RAZORPAY_KEY_ID`)
  - Kahan: Razorpay Dashboard → Settings → API Keys → Regenerate
  - Ye LIVE key hai, test nahi.

- [ ] **`CASHFREE_SECRET_KEY`** (aur `CASHFREE_APP_ID`)
  - Kahan: Cashfree Dashboard → Developers → API Keys
  - Ye PRODUCTION key hai.

- [ ] **`UPI_GATEWAY_API_KEY`**
  - Kahan: UPI Gateway merchant dashboard → API settings

- [ ] **`OPENAI_API_KEY`**
  - Kahan: platform.openai.com → API keys → purani revoke karo, nayi banao
  - **Khatra:** koi aapke paise se AI use kar sakta hai.

---

## LEVEL 3 — Email (customer ka bharosa)

- [ ] **`SENDGRID_API_KEY`**
  - Kahan: SendGrid → Settings → API Keys → purani delete, nayi banao
  - **Khatra:** koi `oceanlinux.com` ke naam se aapke customers ko fake email bhej sakta hai.

- [ ] **`SMTP_PASS`**
  - Kahan: GoDaddy / email provider mein `hello@oceanlinux.com` ka password badlo
  - **Khatra:** upar wala hi — aapke naam se email.

---

## LEVEL 4 — Server control panels

- [ ] **`VIRTUALIZOR_API_PASSWORD_1`** aur `VIRTUALIZOR_API_KEY_1`
- [ ] **`VIRTUALIZOR_API_PASSWORD_2`** aur `VIRTUALIZOR_API_KEY_2`
- [ ] **`VIRTUALIZOR_API_PASSWORD_3`** aur `VIRTUALIZOR_API_KEY_3`
  - Kahan: har Virtualizor panel mein login → API Credentials → regenerate
  - **Khatra:** in keys se seedha VPS control ho sakta hai (band karna, format karna).

- [ ] **`SMARTVPS_PASSWORD`** aur `SMARTVPS_BASIC_TOKEN`
  - Kahan: SmartVPS account settings
  - Note: abhi password `898989` hai — bahut kamzor. Naya majboot rakho.

- [ ] **`HOSTYCARE_API_KEY`** — Hostycare panel se regenerate karo
- [ ] **`ADVPS_API_KEY`** — ADVPS panel se regenerate karo
- [ ] **`JOY_API_TOKEN`** aur **`JOY_API_KEY`** — Joy Services panel se regenerate karo

---

## LEVEL 5 — Internal keys (khud banao)

- [ ] **`CRON_SECRET`** — naya khud banao
  - **Khatra:** isse koi aapke background jobs (cleanup, provisioning) chala sakta hai.

- [ ] **`INTERNAL_API_KEY`** — naya khud banao
  - **Khatra:** isse koi kisi bhi customer ka VPS format kar sakta hai.
  - Note: ye Hosthell ke saath share hoti hai. Wahan bhi wahi nayi value daalni hogi, warna wo integration band ho jayega.

---

## Nayi lines jo `.env` mein add karni hain

Ye abhi missing hain:

- [ ] **`COMPANY_SESSION_SECRET`** — naya khud banao
  ```
  COMPANY_SESSION_SECRET=<naya random secret>
  ```
  Abhi company portal ka login purane `TOKEN_SECRET` par chal raha hai. Wo leaked hai, is liye company ka login banaya ja sakta hai. Ye alag secret hona zaroori hai.

- [ ] **`RAZORPAY_WEBHOOK_SECRET`**
  ```
  RAZORPAY_WEBHOOK_SECRET=<Razorpay dashboard se>
  ```
  Kahan: Razorpay Dashboard → Settings → Webhooks → apna webhook → secret copy karo.
  Abhi ye set nahi hai, is liye Razorpay ka webhook kuch nahi kar raha. Isse payment confirm hone mein dikkat aa sakti hai agar customer payment ke baad browser band kar de.

- [ ] **`NODE_ENV=production`** — hosting (Vercel) par set hona chahiye.
  Agar ye set nahi hai to kuch security checks dheele pad jaate hain.

---

## Aakhri 3 cheezein

- [ ] Hosting (Vercel) ke Environment Variables mein bhi **ye saari nayi values update karo**. Sirf local `.env` badalna kaafi nahi hai.

- [ ] Check karo ki `.gitignore` mein `.env` likha hai, taaki dobara galti se upload na ho:
  ```bash
  git check-ignore .env
  ```
  Agar output mein `.env` aaya, to theek hai.

- [ ] Deploy karo, phir ek test karo: login karke ek chhota payment karke dekho ki order confirm ho raha hai.

---

## Baad ke liye (turant khatra nahi)

Ye cheezein abhi urgent nahi hain, jab time mile tab bata dena:

- Company portal ke passwords aur reseller ke `apiSecret` database mein plain text mein pade hain — inhe encrypt karne ke liye migration script chahiye.
- `terminal/proxy-setup` tool par login zaroori nahi hai — koi bina account bhi use kar sakta hai.
- Admin panel ka user/order export bahut bada ho sakta hai aur usme customers ke VPS password bhi aate hain.
- `internal/service-action` (Hosthell proxy) mein ek bug hai — wo abhi kaam nahi kar raha.
