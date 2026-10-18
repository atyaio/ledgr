import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  addDays,
  addMonths,
  daysInMonth,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_REVENUE_CATEGORIES,
  majorToMinor,
  startOfMonth,
  todayISO,
  type Category,
  type Stakeholder,
} from '@atyaio/ledgr-shared';
import { AppModule } from './app.module';
import type { CurrentUser } from './common/auth/current-user.decorator';
import { LedgrContext } from './common/config/ledgr-config';
import { PrismaService } from './common/prisma/prisma.service';
import { CategoriesService } from './modules/categories/categories.service';
import { CustomFieldsService } from './modules/custom-fields/custom-fields.service';
import { ExpensesService } from './modules/expenses/expenses.service';
import { RecurringService } from './modules/recurring/recurring.service';
import { RevenueService } from './modules/revenue/revenue.service';
import { PaymentMethodsService } from './modules/payment-methods/payment-methods.service';
import { SettlementsService } from './modules/settlements/settlements.service';
import { StakeholdersService } from './modules/stakeholders/stakeholders.service';

export interface SeedDemoOptions {
  /** How many months of history to generate (default 12). */
  months?: number;
  /** Seed even when the database already holds expenses. */
  force?: boolean;
  /** PRNG seed; the same seed always produces the same data. */
  seed?: number;
}

export interface SeedDemoResult {
  stakeholders: number;
  categories: number;
  customFields: number;
  expenses: number;
  revenue: number;
  settlements: number;
  recurring: number;
  from: string;
  to: string;
}

const SEED_ACTOR: CurrentUser = { id: 'demo-seed', email: 'demo@ledgr', role: 'admin' };

/** mulberry32 — small deterministic PRNG. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ExpenseProfile {
  category: string;
  weight: number;
  min: number; // major units
  max: number;
  vendors: string[];
  descriptions: string[];
}

const EXPENSE_PROFILES: ExpenseProfile[] = [
  { category: 'Salaries', weight: 3, min: 1800, max: 4200, vendors: ['Payroll'], descriptions: ['Contractor payout', 'Part-time designer', 'QA contractor', 'Junior dev stipend'] },
  { category: 'Software & subscriptions', weight: 6, min: 9, max: 240, vendors: ['GitHub', 'Figma', 'Notion', 'Slack', 'Linear', 'JetBrains', '1Password', 'Vercel'], descriptions: ['Team plan', 'Monthly subscription', 'Seats renewal', 'Annual licence (monthly)'] },
  { category: 'Hosting & infrastructure', weight: 4, min: 40, max: 900, vendors: ['AWS', 'Hetzner', 'Cloudflare', 'Supabase', 'Fly.io'], descriptions: ['Compute + storage', 'Edge network', 'Database cluster', 'Object storage', 'CI minutes'] },
  { category: 'Marketing', weight: 3, min: 50, max: 1500, vendors: ['Google Ads', 'LinkedIn', 'Product Hunt', 'Mailchimp'], descriptions: ['Campaign spend', 'Sponsored post', 'Newsletter tool', 'Launch promo'] },
  { category: 'Office & rent', weight: 1, min: 60, max: 400, vendors: ['WeWork', 'Office Depot', 'IKEA'], descriptions: ['Meeting room credits', 'Office supplies', 'Desk accessories'] },
  { category: 'Equipment', weight: 1, min: 120, max: 2600, vendors: ['Apple', 'Dell', 'Logitech', 'Amazon'], descriptions: ['Monitor', 'Laptop', 'Keyboard + mouse', 'Webcam', 'Headset'] },
  { category: 'Travel', weight: 1, min: 35, max: 1200, vendors: ['Uber', 'EgyptAir', 'Airbnb', 'Booking.com'], descriptions: ['Client visit', 'Conference trip', 'Airport transfer', 'Hotel – 2 nights'] },
  { category: 'Legal & accounting', weight: 1, min: 150, max: 1200, vendors: ['Baker Tilly', 'LegalZoom', 'Local notary'], descriptions: ['Monthly bookkeeping', 'Contract review', 'Tax filing', 'Trademark renewal'] },
  { category: 'Fees & taxes', weight: 2, min: 5, max: 600, vendors: ['Stripe', 'Wise', 'PayPal', 'Tax authority'], descriptions: ['Payment processing fees', 'FX conversion fee', 'VAT payment', 'Bank charges'] },
  { category: 'Other', weight: 1, min: 10, max: 300, vendors: ['Misc', 'Starbucks', 'Talabat'], descriptions: ['Team lunch', 'Gifts for clients', 'Printing', 'Misc'] },
];

const CLIENTS = ['Acme Corp', 'Nile Logistics', 'Bright Dental', 'Kite Analytics', 'Sahara Tours', 'Orbit Health', 'Flux Media', 'Harbor Bank'];
const CHANNELS = ['Direct', 'Upwork', 'Referral'];

/**
 * Populate a project with realistic demo data for a small software studio.
 * Deterministic for a given seed. Refuses to run on a database that already has
 * expenses unless `opts.force` is set.
 */
export async function seedDemo(ctx: LedgrContext, opts: SeedDemoOptions = {}): Promise<SeedDemoResult> {
  const months = Math.max(1, Math.min(opts.months ?? 12, 60));
  const rand = prng(opts.seed ?? 20261017);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
  const between = (min: number, max: number) => min + rand() * (max - min);
  const chance = (p: number) => rand() < p;
  const money = (major: number) => majorToMinor(Math.round(major * 100) / 100, ctx.currency);

  const app = await NestFactory.createApplicationContext(AppModule.forRoot({ ctx }), { logger: ['warn', 'error'] });
  try {
    const prisma = app.get(PrismaService);
    const stakeholders = app.get(StakeholdersService);
    const categories = app.get(CategoriesService);
    const customFields = app.get(CustomFieldsService);
    const expenses = app.get(ExpensesService);
    const revenue = app.get(RevenueService);
    const settlements = app.get(SettlementsService);
    const recurring = app.get(RecurringService);
    const paymentMethodsSvc = app.get(PaymentMethodsService);

    if (!opts.force && (await prisma.expense.count()) > 0) {
      throw new Error('This project already contains expenses. Pass { force: true } to seed demo data anyway.');
    }

    // ─── Custom fields ─────────────────────────────────────────────────────────
    const cfDefs = [
      { entity: 'expense', key: 'invoice_no', label: 'Invoice no.', type: 'text', options: [], required: false },
      { entity: 'expense', key: 'reimbursable', label: 'Reimbursable', type: 'boolean', options: [], required: false },
      { entity: 'revenue', key: 'client', label: 'Client', type: 'text', options: [], required: false },
      { entity: 'revenue', key: 'channel', label: 'Channel', type: 'select', options: CHANNELS, required: false },
      { entity: 'stakeholder', key: 'iban', label: 'IBAN', type: 'text', options: [], required: false },
      { entity: 'stakeholder', key: 'joined_role', label: 'Joined as', type: 'select', options: ['Founder', 'Partner', 'Engineer'], required: false },
    ] as const;
    const existingCf = new Set((await customFields.list({ includeArchived: true })).map((f) => `${f.entity}:${f.key}`));
    let cfCount = 0;
    for (const def of cfDefs) {
      if (existingCf.has(`${def.entity}:${def.key}`)) continue;
      await customFields.create({ ...def, options: [...def.options] }, SEED_ACTOR);
      cfCount++;
    }

    // ─── Stakeholders ──────────────────────────────────────────────────────────
    const people: Stakeholder[] = [];
    const seedPeople = [
      { name: 'Nour Hassan', nameAr: 'نور حسن', sharePercent: 50, email: 'nour@studio.example', role: 'Founder' },
      { name: 'Omar Adel', nameAr: 'عمر عادل', sharePercent: 30, email: 'omar@studio.example', role: 'Partner' },
      { name: 'Layla Said', nameAr: 'ليلى سعيد', sharePercent: 20, email: 'layla@studio.example', role: 'Engineer' },
    ];
    for (const p of seedPeople) {
      const existing = await stakeholders.findByName(p.name);
      people.push(
        existing ??
          (await stakeholders.create(
            {
              name: p.name,
              nameAr: p.nameAr,
              sharePercent: p.sharePercent,
              email: p.email,
              active: true,
              joinedAt: addMonths(startOfMonth(todayISO()), -(months + 2)),
              customFields: { iban: `EG${String(Math.floor(rand() * 1e12)).padStart(12, '0')}`, joined_role: p.role },
            },
            SEED_ACTOR,
          )),
      );
    }

    // ─── Categories ────────────────────────────────────────────────────────────
    const budgets: Record<string, number> = {
      Salaries: money(25_000),
      'Software & subscriptions': money(1800),
      'Hosting & infrastructure': money(6500),
      Marketing: money(8000),
    };
    const AR: Record<string, string> = {
      Salaries: 'الرواتب', 'Software & subscriptions': 'برامج واشتراكات', 'Hosting & infrastructure': 'استضافة وبنية تحتية', Marketing: 'تسويق', 'Office & rent': 'مكتب وإيجار',
      Equipment: 'معدات', Travel: 'سفر', 'Legal & accounting': 'قانوني ومحاسبة', 'Fees & taxes': 'رسوم وضرائب', Other: 'أخرى',
      Sales: 'مبيعات', Services: 'خدمات', Subscriptions: 'اشتراكات', Consulting: 'استشارات',
    };
    const expenseCats = new Map<string, Category>();
    for (const name of DEFAULT_EXPENSE_CATEGORIES) {
      let cat = (await categories.findByName('expense', name)) ?? (await categories.create({ name, nameAr: AR[name] ?? null, kind: 'expense', monthlyBudgetMinor: budgets[name] ?? null }, SEED_ACTOR));
      if (!cat.nameAr && AR[name]) cat = await categories.update(cat.id, { nameAr: AR[name] }, SEED_ACTOR);
      if (budgets[name] && cat.monthlyBudgetMinor !== budgets[name]) cat = await categories.update(cat.id, { monthlyBudgetMinor: budgets[name] }, SEED_ACTOR);
      expenseCats.set(name, cat);
    }
    const revenueCats = new Map<string, Category>();
    for (const name of DEFAULT_REVENUE_CATEGORIES) {
      let cat = (await categories.findByName('revenue', name)) ?? (await categories.create({ name, nameAr: AR[name] ?? null, kind: 'revenue' }, SEED_ACTOR));
      if (!cat.nameAr && AR[name]) cat = await categories.update(cat.id, { nameAr: AR[name] }, SEED_ACTOR);
      revenueCats.set(name, cat);
    }

    // ─── Payment methods ───────────────────────────────────────────────────────
    const methods = [] as { id: string }[];
    const methodNames: [string, string][] = [['Cash', 'كاش'], ['Visa', 'فيزا'], ['Online transfer', 'تحويل إلكتروني']];
    for (const [i, [name, nameAr]] of methodNames.entries()) {
      methods.push((await paymentMethodsSvc.findByName(name)) ?? (await paymentMethodsSvc.create({ name, nameAr, isDefault: i === 0 }, SEED_ACTOR)));
    }

    // ─── Expenses & revenue ────────────────────────────────────────────────────
    const today = todayISO();
    const firstMonth = addMonths(startOfMonth(today), -(months - 1));
    const weighted = EXPENSE_PROFILES.flatMap((p) => Array<ExpenseProfile>(p.weight).fill(p));
    let expenseCount = 0;
    let revenueCount = 0;
    let invoice = 1040;

    for (let m = 0; m < months; m++) {
      const monthStart = addMonths(firstMonth, m);
      const [y, mo] = monthStart.split('-').map(Number);
      const lastDay = monthStart.slice(0, 7) === today.slice(0, 7) ? Number(today.slice(8, 10)) : daysInMonth(y, mo - 1);
      const dayIn = () => addDays(monthStart, Math.floor(rand() * lastDay));
      const growth = 1 + m * 0.03; // the studio grows a little every month

      for (let i = 0; i < 25; i++) {
        const profile = pick(weighted);
        const paidBy = chance(0.4) ? null : pick(people).id;
        const useCustom = chance(0.08);
        const expenseAmount = money(between(profile.min, profile.max) * growth);
        const expenseMethod = chance(0.5) ? methods[1] : chance(0.7) ? methods[2] : methods[0];
        await expenses.create(
          {
            date: dayIn(),
            amountMinor: expenseAmount,
            payments: [{ paymentMethodId: expenseMethod.id, amountMinor: expenseAmount }],
            description: `${pick(profile.descriptions)} – ${pick(profile.vendors)}`,
            categoryId: expenseCats.get(profile.category)!.id,
            paidByStakeholderId: paidBy,
            vendor: pick(profile.vendors),
            notes: chance(0.2) ? 'Auto-generated demo entry' : null,
            splitMode: useCustom ? 'custom' : 'ownership',
            customSplits: useCustom ? [{ stakeholderId: people[0].id, sharePercent: 50 }, { stakeholderId: people[1].id, sharePercent: 50 }] : undefined,
            customFields: { invoice_no: chance(0.6) ? `INV-${invoice++}` : null, reimbursable: paidBy !== null && chance(0.5) },
          },
          SEED_ACTOR,
        );
        expenseCount++;
      }

      for (let i = 0; i < 8; i++) {
        const client = pick(CLIENTS);
        const method = chance(0.55) ? methods[0] : chance(0.6) ? methods[1] : methods[2];
        const split = chance(0.3) && methods.length > 1;
        const catName = pick(DEFAULT_REVENUE_CATEGORIES);
        const base = catName === 'Subscriptions' ? between(200, 1500) : catName === 'Consulting' ? between(800, 6000) : between(1500, 14000);
        await revenue.create(
          {
            date: dayIn(),
            amountMinor: money(base * growth),
            description: `${client} – ${catName === 'Subscriptions' ? 'monthly plan' : catName === 'Consulting' ? 'advisory hours' : `milestone ${1 + Math.floor(rand() * 4)}`}`,
            categoryId: revenueCats.get(catName)!.id,
            source: client,
            payments: split
              ? [{ paymentMethodId: methods[0].id, amountMinor: Math.round(money(base * growth) * 0.6) }, { paymentMethodId: methods[1].id, amountMinor: money(base * growth) - Math.round(money(base * growth) * 0.6) }]
              : [{ paymentMethodId: method.id, amountMinor: money(base * growth) }],
            receivedByStakeholderId: chance(0.7) ? null : pick(people).id,
            customFields: { client, channel: pick(CHANNELS) },
          },
          SEED_ACTOR,
        );
        revenueCount++;
      }
    }

    // ─── Settlements ───────────────────────────────────────────────────────────
    const settlementSpecs = [
      { from: people[1], to: people[0], months: -2, amount: 1200, note: 'Catching up on Q2 hosting' },
      { from: people[2], to: null, months: -1, amount: 850, note: 'Repaying the pool' },
      { from: people[0], to: people[2], months: 0, amount: 400, note: 'Equipment share' },
    ];
    for (const s of settlementSpecs) {
      await settlements.create(
        { date: addDays(addMonths(startOfMonth(today), s.months), 14), fromStakeholderId: s.from.id, toStakeholderId: s.to?.id ?? null, amountMinor: money(s.amount), note: s.note },
        SEED_ACTOR,
      );
    }

    // ─── Recurring rules (start next month so nothing is generated immediately) ─
    const nextMonth = addMonths(startOfMonth(today), 1);
    await recurring.create(
      {
        kind: 'expense',
        name: 'Office rent',
        frequency: 'monthly',
        interval: 1,
        startDate: nextMonth,
        active: true,
        template: {
          description: 'Office rent – WeWork',
          amountMinor: money(650),
          categoryId: expenseCats.get('Office & rent')!.id,
          partyStakeholderId: null,
          vendorOrSource: 'WeWork',
          notes: null,
          splitMode: 'ownership',
          customSplits: [],
          customFields: { invoice_no: null, reimbursable: false },
        },
      },
      SEED_ACTOR,
    );
    await recurring.create(
      {
        kind: 'revenue',
        name: 'Acme retainer',
        frequency: 'monthly',
        interval: 1,
        startDate: nextMonth,
        active: true,
        template: {
          description: 'Acme Corp – monthly retainer',
          amountMinor: money(3500),
          categoryId: revenueCats.get('Services')!.id,
          partyStakeholderId: null,
          vendorOrSource: 'Acme Corp',
          notes: null,
          splitMode: 'ownership',
          customSplits: [],
          customFields: { client: 'Acme Corp', channel: 'Direct' },
        },
      },
      SEED_ACTOR,
    );

    return {
      stakeholders: people.length,
      categories: expenseCats.size + revenueCats.size,
      customFields: cfCount,
      expenses: expenseCount,
      revenue: revenueCount,
      settlements: settlementSpecs.length,
      recurring: 2,
      from: firstMonth,
      to: today,
    };
  } finally {
    await app.close();
  }
}
