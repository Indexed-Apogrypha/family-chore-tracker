# User guide

How to use Family Chore Tracker as a **parent** and a **kid**. No technical knowledge needed.

---

## What it does

A kid finishes a chore, takes a photo, and submits it. An AI takes a quick look and gives its
opinion — but that opinion is **only advice**. A **parent always makes the real decision** to approve
or reject. Approved chores earn **points** that add up over time.

---

## Two ways to use it

- **Practice mode** — no account, nothing saved permanently. Open the app and click **“Enter
  practice family.”** A demo family appears with one parent and one kid (**Kiddo**, PIN **1234**).
  Great for trying things out.
- **Real mode** — a parent signs up with email + password; the family and its data are saved. Use
  this for actual day-to-day chore tracking.

The rest of this guide works the same in both modes (in practice mode you skip sign-up).

---

## For parents

### 1. Set up your family
- **Sign up** with your email, a password, your family name, and your name. (You may need to confirm
  your email before the first login.)
- **Log in.** You land in the parent hub.

### 2. Add your kids
- Open **profiles / add a kid**, enter the kid's name and a **4-digit PIN**. The PIN is how that kid
  unlocks their profile on a shared device. (It's a simple gate, not a bank-grade password.)

### 3. Create chores
- **One-off chore** — a single task with a title, a point value, who it's for, and a due date
  (e.g. *“Tidy the bedroom — 10 pts — Sam — today”*).
- **Recurring chore (template)** — a task that comes back automatically: **daily**, or **weekly on
  chosen days**. Recurring chores appear on the kid's board on the days they're due. You can
  **deactivate** a template later to stop it generating new chores.

### 4. Review submissions
- When a kid submits a photo, it appears in **Review submissions** as *pending review*, with the
  photo and the AI's advisory opinion.
- **You decide.** **Approve** to credit the points. **Reject** to send it back — the chore returns to
  the kid's list so they can try again. You can overrule the AI either way.

### 5. See points
- Each kid's running total is the sum of their approved chores. Points only ever go up in v1 (a
  rewards/redemption catalog is planned for later).

---

## For kids

### 1. Switch to your profile
- On the family device, choose your name and enter your **PIN**. Now the app is acting as you.

### 2. Do today's chores
- **Today's chores** shows what's due for you today.
- Finish a chore, then **take a photo** of it and **submit**.
- The app checks it (that's the AI's quick look) and the chore goes to your **parent for review**.

### 3. Wait for approval → earn points
- Your parent approves or rejects it. **Approved** = you earn the points. **Rejected** = it comes
  back to your list to try again.

---

## Good to know

- **The AI never has the final say.** It's just a helper; your parent decides.
- **“Couldn't check it just now — your photo is saved.”** If you see this, the AI was briefly
  unavailable. Your photo is safe — just tap **Retry**; you don't need to take a new picture.
- **Photos** must be images (JPEG/PNG/WebP/HEIC) and under 10 MB. A phone photo is fine.
- **Shared device?** Use the profile switcher (and your PIN) to hand the app between a parent and a
  kid.

---

## Related
- [API reference](api-reference.md) — for developers wiring up these flows.
- [Data model & state machine](data-model.md) — the chore lifecycle behind the screens.
