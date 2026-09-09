---
name: use-zustand
description: Enforce Zustand for all global state management. Automatically install Zustand if missing, create standard stores, and BLOCK React Context API usage. Trigger when user says global state, share state, store data, auth, theme, profile, user session.
allowed-tools: Glob, Read, Write, Edit, AskUserQuestion, Bash
---

# 🐻 Skill: Use Zustand

## 🔒 IRON LAW
UNDER NO CIRCUMSTANCES USE REACT CONTEXT API FOR GLOBAL STATE. ZUSTAND IS THE ONLY ALLOWED SOLUTION. IF YOU ARE ABOUT TO WRITE `createContext`, `useContext`, OR `<Provider>` STOP RIGHT NOW AND USE THIS SKILL.

---

## 📋 Workflow Checklist

```
✅ Progress:

- [ ] Step 0: Verify Zustand installation ⛔ BLOCKING
  - [ ] 0.1 Check if zustand is in package.json
  - [ ] 0.2 If missing: install zustand
  - [ ] 0.3 Check existing store patterns in project
- [ ] Step 1: Analyze existing stores
  - [ ] 1.1 Scan src/store/ directory
  - [ ] 1.2 Identify standard pattern used in project
  - [ ] 1.3 Find if there are existing related stores
- [ ] Step 2: Create store following pattern
  - [ ] 2.1 Create store file in correct location
  - [ ] 2.2 Follow exact same pattern as existing stores
  - [ ] 2.3 Add standard actions and selectors
- [ ] Step 3: Document usage
  - [ ] 3.1 Show how to use the store in components
  - [ ] 3.2 Confirm no Context API was used anywhere
```

---

## 🚀 Step 0: Verify Zustand installation

First run these checks:

```bash
# Check if installed
grep "zustand" package.json
```

### ❌ If not installed:
1. Run: `npm install zustand` or ask user package manager
2. Confirm installation completed
3. Proceed to create stores

---

## 🚀 Step 1: Analyze existing store patterns

Scan existing stores first:
```bash
glob "src/**/*store*.ts" "src/store/**/*.ts" "src/stores/**/*.ts"
```

✅ Follow **EXACTLY** the pattern already used in the project. Do NOT invent a new pattern.

✅ **ALL STORES MUST BE PLACED IN `/src/stores/` FOLDER.**
✅ Never place store files anywhere else. Always create /src/stores/ directory if it doesn't exist.

### ✅ Standard Zustand pattern for this project:
```typescript
import { create } from 'zustand'

interface ThemeStore {
  theme: 'light' | 'dark'
  toggleTheme: () => void
  setTheme: (theme: 'light' | 'dark') => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: 'light',
  toggleTheme: () => set(state => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
  setTheme: (theme) => set({ theme }),
}))
```

### ✅ Usage in components:
```tsx
// Correct usage
const theme = useThemeStore(state => state.theme)
const toggleTheme = useThemeStore(state => state.toggleTheme)
```

---

## ❌ Anti-Patterns - STRICTLY FORBIDDEN

❌ **DO NOT USE** React Context API. Ever.
❌ **DO NOT CREATE** `createContext`, `useContext`, Context Providers
❌ **DO NOT WRAP** your app with `<Provider>` components
❌ **DO NOT** implement your own state management solution
❌ **DO NOT** use Redux, MobX, Jotai, Recoil unless explicitly asked
❌ **DO NOT** pass props 3+ levels down
❌ **DO NOT** invent custom Zustand patterns - follow existing ones

⚠️ **IF YOU FIND YOURSELF WRITING ANY CONTEXT CODE, DELETE IT IMMEDIATELY AND USE ZUSTAND**

---

## ✅ Pre-Delivery Checklist

Before completing:

- [ ] Zustand is installed in package.json
- [ ] Store follows 100% pattern of existing stores
- [ ] No `createContext`, `useContext`, or `<Provider>` exists
- [ ] Store is properly typed with TypeScript interface
- [ ] Actions are pure and only call `set()`
- [ ] Selectors are properly destructured
- [ ] No unnecessary re-render patterns
- [ ] Store file is placed in `/src/stores/` directory ONLY
- [ ] `/src/stores/` directory created if missing

---

## 📌 Trigger Conditions

This skill MUST be invoked when:
1. User asks for global state
2. User asks to share data between components/pages
3. You need to store auth state, user profile, theme, settings
4. You would normally reach for Context API
5. You need to pass props more than 2 levels deep

---

## 💡 Usage Examples

```
User: "I need to store user auth information"
→ Skill:
   1. Checks if zustand is installed
   2. Creates src/store/auth.store.ts
   3. Follows existing store pattern
   4. Shows usage example
   5. Confirms no Context API was used
```

```
User: "how to share theme between pages?"
→ Skill automatically runs, creates theme store, tells user how to use it
```

**IMPORTANT** Zustand pattern follow `.claude/skills/use-zustand/references/zustand-typescript.md` for TypeScript usage. Always follow the exact same pattern as existing stores in the project.
