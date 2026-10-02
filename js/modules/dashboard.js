import * as UI from '../core/ui.js';
import { esc, fmtNum, fmtDate, today, monthStart } from '../core/utils.js';
import * as idb from '../db/idb.js';
import * as Posting from '../services/posting.js';
import * as Catalog from '../services/catalog.js';
import { t } from '../i18n.js';
import { getSettings } from '../core/settings.js';

const $ = window.jQuery;
const cur = () => getSettings().currency;
const money = (n) => `${esc(cur())} ${fmtNum(n)}`;

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return t('greetMorning') || 'Good Morning';
  if (h < 17) return t('greetAfternoon') || 'Good Afternoon';
  return t('greetEvening') || 'Good Evening';
}

function greetIcon() {
  const h = new Date().getHours();
  if (h < 12) return 'sunrise';
  if (h < 17) return 'sun';
  return 'moon-stars';
}

async function loadStats() {
  const animals = Catalog.allAnimals();
  const active = animals.filter((a) => a.status === 'active');
  const milkingAnimals = active.filter((a) => a.gender === 'female' && (a.species === 'cattle' || a.species === 'buffalo'));
  const calves = active.filter((a) => {
    if (!a.dob) return false;
    const ageMonths = (Date.now() - new Date(a.dob).getTime()) / (30.44 * 86400000);
    return ageMonths < 12;
  });

  const todayDate = today();
  const monthStartDate = monthStart();

  // Today's milk (morning + evening)
  const milkToday = await idb.getAllByIndex('milkRecords', 'date', todayDate);
  const morningTotal = milkToday.reduce((s, r) => s + (r.morning || 0), 0);
  const eveningTotal = milkToday.reduce((s, r) => s + (r.evening || 0), 0);
  const todayLiters = morningTotal + eveningTotal;
  const milkingCount = milkToday.length;

  // This month's milk
  const monthMilk = await idb.read(['milkRecords'], (tx) =>
    tx.getAllByIndex('milkRecords', 'date', IDBKeyRange.bound(monthStartDate, todayDate + '￿')));
  const monthTotal = monthMilk.reduce((s, r) => s + (r.total || 0), 0);

  // This month's sales
  const monthSales = await idb.read(['milkSales'], (tx) =>
    tx.getAllByIndex('milkSales', 'date', IDBKeyRange.bound(monthStartDate, todayDate + '￿')));
  const activeSales = monthSales.filter((s) => s.status !== 'void');
  const companySales = activeSales.filter((s) => s.saleType === 'company');
  const localSales = activeSales.filter((s) => s.saleType !== 'company');
  const companyQty = companySales.reduce((s, d) => s + (d.quantity || 0), 0);
  const companyAmt = companySales.reduce((s, d) => s + (d.total || 0), 0);
  const localQty = localSales.reduce((s, d) => s + (d.quantity || 0), 0);
  const localAmt = localSales.reduce((s, d) => s + (d.total || 0), 0);
  const totalRevenue = companyAmt + localAmt;

  // Pregnant animals
  const pregnant = await idb.getAllByIndex('breedingRecords', 'pregnancyStatus', 'pregnant');
  const pregnantCount = pregnant.length;

  // Due for calving (next 30 days)
  const futureCalvStr = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const dueSoon = pregnant.filter((r) => r.expectedCalving && r.expectedCalving <= futureCalvStr).length;

  // Due vaccinations (next 14 days)
  const allHealth = await idb.getAll('healthEvents');
  const futureVaxStr = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const dueVax = allHealth.filter((h) => h.nextDue && h.nextDue >= todayDate && h.nextDue <= futureVaxStr).length;

  // Buyer outstanding balance
  const bal = await Posting.allBalances();
  let buyerBal = 0;
  for (const [id, b] of bal) { if (id.startsWith('B:')) buyerBal += b.balance; }

  return {
    totalHerd: active.length,
    milkingAnimals: milkingAnimals.length,
    calves: calves.length,
    pregnantCount,
    morningTotal, eveningTotal, todayLiters, milkingCount,
    monthTotal, totalRevenue,
    companyQty, companyAmt, localQty, localAmt,
    dueSoon, dueVax, buyerBal,
  };
}

export default {
  async render(el) {
    const $el = $(el);
    const s = getSettings();
    const farmName = s.business?.name || t('appName');
    const dateStr = new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    $el.html(`
      <div class="dash-greeting mb-3">
        <div>
          <div class="dash-greeting-name">${esc(getGreeting())} 🌿</div>
          <div class="dash-greeting-sub">${esc(farmName)} · ${esc(dateStr)}</div>
        </div>
        <i class="bi bi-${greetIcon()}-fill dash-greeting-icon"></i>
      </div>

      <div class="stat-grid mb-3" id="dash-stats"><div class="col-span-4 text-center py-2">${UI.spinner('')}</div></div>

      <div class="milk-prod-card mb-3" id="dash-milk">${UI.spinner('')}</div>

      <div class="row g-3 mb-3">
        <div class="col-lg-6">
          <div class="sales-breakdown-card" id="dash-month">${UI.spinner()}</div>
        </div>
        <div class="col-lg-6">
          <div class="sales-breakdown-card" id="dash-sales">${UI.spinner()}</div>
        </div>
      </div>

      <div class="row g-3">
        <div class="col-lg-6">
          <h2 class="h6 mb-2">${esc(t('quickActions'))}</h2>
          <div class="row g-2 mb-3">
            <div class="col-6"><a href="#/milk" class="quick-action text-decoration-none">
              <i class="bi bi-droplet-half-fill text-primary"></i><span>${esc(t('recordMilk'))}</span></a></div>
            <div class="col-6"><a href="#/animals" class="quick-action text-decoration-none">
              <i class="bi bi-plus-circle text-success"></i><span>${esc(t('addAnimal'))}</span></a></div>
            <div class="col-6"><a href="#/breeding" class="quick-action text-decoration-none">
              <i class="bi bi-capsule text-danger"></i><span>${esc(t('breeding'))}</span></a></div>
            <div class="col-6"><a href="#/milkSales" class="quick-action text-decoration-none">
              <i class="bi bi-bag-check text-warning"></i><span>${esc(t('milkSale'))}</span></a></div>
          </div>
          <div id="dash-alerts"></div>
        </div>
        <div class="col-lg-6">
          <h2 class="h6 mb-2">${esc(t('recentActivity'))}</h2>
          <div class="list-card" id="dash-recent">${UI.spinner()}</div>
        </div>
      </div>`);

    try {
      const stats = await loadStats();

      // Herd stats
      $('#dash-stats').html(`
        <div class="stat-tile st-green">
          <div class="st-icon"><i class="bi bi-collection-fill"></i></div>
          <div class="st-val">${stats.totalHerd}</div>
          <div class="st-lbl">${esc(t('activeHerd') || 'Active Herd')}</div>
        </div>
        <div class="stat-tile st-blue">
          <div class="st-icon"><i class="bi bi-droplet-fill"></i></div>
          <div class="st-val">${stats.milkingAnimals}</div>
          <div class="st-lbl">${esc(t('milkingCows') || 'Milking')}</div>
        </div>
        <div class="stat-tile st-amber">
          <div class="st-icon"><i class="bi bi-stars"></i></div>
          <div class="st-val">${stats.calves}</div>
          <div class="st-lbl">Calves</div>
        </div>
        <div class="stat-tile st-pink">
          <div class="st-icon"><i class="bi bi-heart-pulse-fill"></i></div>
          <div class="st-val">${stats.pregnantCount}</div>
          <div class="st-lbl">${esc(t('pregnantAnimals') || 'Pregnant')}</div>
        </div>`);

      // Today's milk production
      if (stats.todayLiters === 0) {
        $('#dash-milk').html(`
          <div class="milk-prod-header">
            <i class="bi bi-droplet-half-fill"></i>
            <span>${esc(t('todayProduction'))}</span>
            <span class="badge bg-success ms-auto small">${fmtDate(today())}</span>
          </div>
          <div class="text-center text-body-secondary py-2 small">
            <i class="bi bi-droplet-half-fill opacity-25 fs-2 d-block mb-2"></i>
            No milk recorded today.
            <a href="#/milk" class="ms-1">Record now →</a>
          </div>`);
      } else {
        $('#dash-milk').html(`
          <div class="milk-prod-header">
            <i class="bi bi-droplet-half-fill"></i>
            <span>${esc(t('todayProduction'))}</span>
            <span class="badge bg-success ms-auto small">${fmtDate(today())}</span>
          </div>
          <div class="milk-sessions">
            <div class="milk-session-box">
              <div class="sess-icon"><i class="bi bi-sunrise" style="color:#f9a825"></i></div>
              <div class="sess-label">${esc(t('morningMilk') || 'Morning')}</div>
              <div class="sess-val">${fmtNum(stats.morningTotal)}</div>
              <div class="sess-unit">liters</div>
            </div>
            <div class="milk-session-plus">+</div>
            <div class="milk-session-box">
              <div class="sess-icon"><i class="bi bi-moon-stars-fill" style="color:#7986cb"></i></div>
              <div class="sess-label">${esc(t('eveningMilk') || 'Evening')}</div>
              <div class="sess-val">${fmtNum(stats.eveningTotal)}</div>
              <div class="sess-unit">liters</div>
            </div>
          </div>
          <div class="milk-total-box">
            <div>
              <div class="total-label">${esc(t('totalMilk') || 'Total Today')}</div>
              <div class="total-sub">${stats.milkingCount} animal${stats.milkingCount !== 1 ? 's' : ''} recorded</div>
            </div>
            <div>
              <span class="total-val">${fmtNum(stats.todayLiters)}</span>
              <span class="total-unit"> L</span>
            </div>
          </div>`);
      }

      // Monthly milk + revenue
      $('#dash-month').html(`
        <div class="sb-header">${esc(t('monthlyMilk') || 'This Month')}</div>
        <div class="sb-row">
          <div class="sb-type-icon" style="background:#e8f5e9;color:#2e7d32"><i class="bi bi-calendar-check"></i></div>
          <div class="sb-info">
            <div class="sb-name">Total Milk</div>
            <div class="sb-qty">${fmtNum(stats.monthTotal)} liters</div>
          </div>
        </div>
        <div class="sb-row">
          <div class="sb-type-icon" style="background:#e3f2fd;color:#1565c0"><i class="bi bi-currency-exchange"></i></div>
          <div class="sb-info">
            <div class="sb-name">Revenue</div>
            <div class="sb-qty">${money(stats.totalRevenue)}</div>
          </div>
          ${stats.buyerBal > 0 ? `<span class="badge bg-warning-subtle text-warning small">${money(stats.buyerBal)} due</span>` : ''}
        </div>`);

      // Company vs local sales
      $('#dash-sales').html(`
        <div class="sb-header">${esc(t('companySales') || 'Sales by Type')}</div>
        <div class="sb-row">
          <div class="sb-type-icon company"><i class="bi bi-building"></i></div>
          <div class="sb-info">
            <div class="sb-name">${esc(t('company') || 'Company')}</div>
            <div class="sb-qty">${fmtNum(stats.companyQty)} L</div>
          </div>
          <div class="sb-amount">${money(stats.companyAmt)}</div>
        </div>
        <div class="sb-row">
          <div class="sb-type-icon local"><i class="bi bi-shop"></i></div>
          <div class="sb-info">
            <div class="sb-name">${esc(t('local') || 'Local / Retail')}</div>
            <div class="sb-qty">${fmtNum(stats.localQty)} L</div>
          </div>
          <div class="sb-amount">${money(stats.localAmt)}</div>
        </div>`);

      // Alerts
      let alerts = '';
      if (stats.dueSoon > 0)
        alerts += `<div class="alert alert-warning py-2 small mb-2"><i class="bi bi-exclamation-triangle me-2"></i>${stats.dueSoon} animal(s) due for calving in 30 days. <a href="#/breeding">View →</a></div>`;
      if (stats.dueVax > 0)
        alerts += `<div class="alert alert-info py-2 small mb-2"><i class="bi bi-heart-pulse me-2"></i>${stats.dueVax} vaccination(s) due in 14 days. <a href="#/health">View →</a></div>`;
      if (stats.buyerBal > 0)
        alerts += `<div class="alert alert-success py-2 small mb-2"><i class="bi bi-cash-coin me-2"></i>Buyers owe ${money(stats.buyerBal)}. <a href="#/buyers">View ledgers →</a></div>`;
      $('#dash-alerts').html(alerts || `<div class="text-body-secondary small py-1"><i class="bi bi-check-circle text-success me-1"></i>No pending alerts.</div>`);

    } catch (e) {
      console.error(e);
      $('#dash-stats').html(UI.errorState(e));
    }

    // Recent milk sales
    try {
      const recent = (await idb.getAll('milkSales'))
        .filter((d) => d.status !== 'void')
        .slice(-6)
        .reverse();
      if (!recent.length) {
        $('#dash-recent').html(UI.emptyState('No sales yet', 'bag-check'));
      } else {
        const typeIcon = (st) => st === 'company' ? 'building' : 'shop';
        $('#dash-recent').html(recent.map((d) => `
          <div class="list-row">
            <div class="thumb"><i class="bi bi-${typeIcon(d.saleType)}"></i></div>
            <div class="main">
              <div class="title">${esc(d.buyerName)}</div>
              <div class="sub">${fmtDate(d.date)} · ${fmtNum(d.quantity)} L${d.saleType ? ` · <span class="badge badge-sale-${d.saleType} small">${d.saleType}</span>` : ''}</div>
            </div>
            <div class="end fw-semibold money">${money(d.total)}</div>
          </div>`).join(''));
      }
    } catch (e) {
      $('#dash-recent').html(UI.errorState(e));
    }
  },
};
