/**
 * test_working_hours.js
 * Comprehensive automated tests for:
 * 1. Working hours calculation (excluding Sundays, after-hours, and custom holidays)
 * 2. Office status detection (Sunday, after-hours, holidays, half-days)
 * 3. Eva prompt generation & Fast Intercept responses for UPC / order status inquiries
 */

import assert from 'assert';
import {
  calculateWorkingHoursRemaining,
  getOfficeHoursStatus,
  getWorkingWindowsForDate,
  getISTDateParts
} from '../api/utils/workingHoursHelper.js';
import { runAgent, buildSystemPrompt } from '../api/utils/aiAgent.js';

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

console.log('🧪 Running Office Calendar & Working Hours Tests...\n');

// ─── 1. Core Working Hours Calculation ────────────────────────────────────────

runTest('Friday 5:00 PM order queried Sunday 2:00 PM (Should be 11h elapsed, 13h remaining)', () => {
  const fri5pm = new Date('2026-09-18T17:00:00+05:30');
  const sun2pm = new Date('2026-09-20T14:00:00+05:30');
  const res = calculateWorkingHoursRemaining(fri5pm, 24, [], sun2pm);
  // Friday 17:00 to 19:00 = 2 hours
  // Saturday 10:00 to 19:00 = 9 hours
  // Sunday = 0 hours
  // Total = 11.0 hours
  assert.strictEqual(res.elapsedWorkingHours, 11);
  assert.strictEqual(res.remainingWorkingHours, 13);
});

runTest('Saturday 6:00 PM order queried Monday 11:00 AM (Should be 2h elapsed, 22h remaining)', () => {
  const sat6pm = new Date('2026-09-19T18:00:00+05:30');
  const mon11am = new Date('2026-09-21T11:00:00+05:30');
  const res = calculateWorkingHoursRemaining(sat6pm, 24, [], mon11am);
  // Saturday 18:00 to 19:00 = 1 hour
  // Sunday = 0 hours
  // Monday 10:00 to 11:00 = 1 hour
  // Total = 2.0 hours
  assert.strictEqual(res.elapsedWorkingHours, 2);
  assert.strictEqual(res.remainingWorkingHours, 22);
});

runTest('Full Day Holiday on Tuesday excluded from working hours', () => {
  const mon5pm = new Date('2026-09-21T17:00:00+05:30');
  const wed11am = new Date('2026-09-23T11:00:00+05:30');
  const holidays = [
    { date: '2026-09-22', type: 'full_day', title: 'National Holiday', isActive: true }
  ];
  const res = calculateWorkingHoursRemaining(mon5pm, 24, holidays, wed11am);
  // Monday 17:00 to 19:00 = 2 hours
  // Tuesday (Holiday) = 0 hours
  // Wednesday 10:00 to 11:00 = 1 hour
  // Total = 3.0 hours
  assert.strictEqual(res.elapsedWorkingHours, 3);
  assert.strictEqual(res.remainingWorkingHours, 21);
});

runTest('Half Day Holiday (Second Half off from 2pm) correctly calculates working hours', () => {
  const mon10am = new Date('2026-09-21T10:00:00+05:30');
  const mon8pm = new Date('2026-09-21T20:00:00+05:30');
  const holidays = [
    { date: '2026-09-21', type: 'half_day', halfDayType: 'second_half', title: 'Staff Event', isActive: true }
  ];
  const res = calculateWorkingHoursRemaining(mon10am, 24, holidays, mon8pm);
  // Monday open 10:00 to 14:00 only = 4 hours
  assert.strictEqual(res.elapsedWorkingHours, 4);
  assert.strictEqual(res.remainingWorkingHours, 20);
});

// ─── 2. Office Status Detection ──────────────────────────────────────────────

runTest('Sunday Status: Non-Working Day, Weekly Off', () => {
  const sunday = new Date('2026-09-20T12:00:00+05:30');
  const status = getOfficeHoursStatus([], sunday);
  assert.strictEqual(status.isSunday, true);
  assert.strictEqual(status.isNonWorkingDay, true);
  assert.strictEqual(status.isOpen, false);
  assert.strictEqual(status.nextWorkingDay, 'Tomorrow'); // Sunday + 1 = Monday
  assert.strictEqual(status.nextWorkingTime, '10:00 AM');
});

runTest('Weekday 8:00 PM Status: Non-Working Hours (After 7 PM)', () => {
  const mondayNight = new Date('2026-09-21T20:00:00+05:30');
  const status = getOfficeHoursStatus([], mondayNight);
  assert.strictEqual(status.isOpen, false);
  assert.strictEqual(status.isNonWorkingHour, true);
  assert.strictEqual(status.isNonWorkingDay, false);
  assert.strictEqual(status.nextWorkingDay, 'Tomorrow');
  assert.strictEqual(status.nextWorkingTime, '10:00 AM');
});

runTest('Holiday Status: Non-Working Day with Custom Title', () => {
  const holidayDate = new Date('2026-10-02T11:00:00+05:30');
  const holidays = [
    { date: '2026-10-02', type: 'full_day', title: 'Gandhi Jayanti', isActive: true }
  ];
  const status = getOfficeHoursStatus(holidays, holidayDate);
  assert.strictEqual(status.isHoliday, true);
  assert.strictEqual(status.isNonWorkingDay, true);
  assert.strictEqual(status.isOpen, false);
  assert.strictEqual(status.holiday.title, 'Gandhi Jayanti');
});

// ─── 3. Eva Prompt Instructions on Sunday / Off Hours ─────────────────────────

runTest('System Prompt incorporates Sunday non-working day instructions for UPC', () => {
  const sunday = new Date('2026-09-20T12:00:00+05:30');
  const sunStatus = getOfficeHoursStatus([], sunday);
  const prompt = buildSystemPrompt({
    name: 'Rahul',
    testOfficeStatus: sunStatus,
    activeProducts: [
      { number: '9876543210', upcStatus: 'upc_in_process', remainingWorkingHours: 14 }
    ]
  });

  assert.match(prompt, /Is Non-Working Day \(Sunday\/Holiday\): YES/);
  assert.match(prompt, /Today is a non-working day/);
  assert.match(prompt, /Our executives will guide you on the next working day/);
});

runTest('System Prompt incorporates after-hours instructions on weekday evening', () => {
  const evening = new Date('2026-09-21T20:15:00+05:30');
  const eveStatus = getOfficeHoursStatus([], evening);
  const prompt = buildSystemPrompt({
    name: 'Amit',
    testOfficeStatus: eveStatus,
    activeProducts: [
      { number: '9876543210', upcStatus: 'upc_in_process', remainingWorkingHours: 16 }
    ]
  });

  assert.match(prompt, /Is Non-Working Hours \(Outside 10am-7pm\): YES/);
  assert.match(prompt, /Our office hours are 10:00 AM to 7:00 PM/);
  assert.match(prompt, /guide you during the next working hours/);
});

// ─── 4. Eva Fast Intercept Responses (Sunday & Off Hours) ─────────────────────

async function testFastInterceptResponses() {
  const sunday = new Date('2026-09-20T14:00:00+05:30');
  const sunStatus = getOfficeHoursStatus([], sunday);

  // Purchased product placed Friday 5pm
  const fri5pm = '2026-09-18T17:00:00+05:30';

  const customerContextSunday = {
    phone: '919876543210',
    testOfficeStatus: sunStatus,
    activeProducts: [
      {
        number: '9876543210',
        orderNumber: 'ORD-5555',
        upcStatus: 'upc_in_process',
        processedAt: fri5pm
      }
    ]
  };

  await runAsyncTest('Customer asking "mere number ka status kya hai" on Sunday -> Eva gives non-working day notice & accurate remaining hours (13h)', async () => {
    const res = await runAgent({ userMessage: 'mere number ka status kya hai', history: [], customerContext: customerContextSunday });
    assert.match(res.reply, /98765 43210/);
    assert.match(res.reply, /Within ~13 working hours/);
    assert.match(res.reply, /Aaj non-working day/);
    assert.match(res.reply, /agle working day/);
  });

  await runAsyncTest('Customer claiming "payment ho gaya" on Sunday -> Eva confirms payment, states 13 working hours & Sunday notice', async () => {
    const res = await runAgent({ userMessage: 'maine 9876543210 ka payment kar diya hai', history: [], customerContext: customerContextSunday });
    assert.match(res.reply, /successfully confirm/i);
    assert.match(res.reply, /~13 working hours/);
    assert.match(res.reply, /Aaj non-working day/i);
    assert.match(res.reply, /agle working day/i);
  });

  await runAsyncTest('Customer asking ownership "9876543210 mera number hai na" on Sunday -> Eva confirms with Sunday notice', async () => {
    const res = await runAgent({ userMessage: '9876543210 mera number hai na confirm', history: [], customerContext: customerContextSunday });
    assert.match(res.reply, /100% confirm/i);
    assert.match(res.reply, /~13 working hours/);
    assert.match(res.reply, /Aaj non-working day/i);
  });

  // Weekday 8:00 PM (After office hours)
  const mondayNight = new Date('2026-09-21T20:00:00+05:30');
  const nightStatus = getOfficeHoursStatus([], mondayNight);
  const customerContextNight = {
    phone: '919876543210',
    testOfficeStatus: nightStatus,
    activeProducts: [
      {
        number: '9876543210',
        orderNumber: 'ORD-5555',
        upcStatus: 'upc_in_process',
        processedAt: fri5pm
      }
    ]
  };

  await runAsyncTest('Customer asking status after 7:00 PM -> Eva gives non-working hours notice (office hours 10am-7pm)', async () => {
    const res = await runAgent({ userMessage: 'mera upc status kya hai', history: [], customerContext: customerContextNight });
    assert.match(res.reply, /10:00 AM se shaam 7:00 PM/i);
    assert.match(res.reply, /agle working hours/i);
  });
}

testFastInterceptResponses().then(() => {
  console.log(`\n🎉 All ${passedTests}/${totalTests} Tests Passed Successfully!`);
}).catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
