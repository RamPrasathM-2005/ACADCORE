import db from "../models/index.js";
import { sendMail } from "./mailService.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { StudentDetails, User, Course } = db;

const reminderSentCache = new Map();
const REMINDER_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
const LOGO_CID = "acadcore-logo";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isLikelyEmail = (value) =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const esc = (val) =>
  String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const findLogoPath = () => {
  const candidates = [
    path.resolve(__dirname, "../../frontend/public/images.jpg"),
    path.resolve(__dirname, "../../frontend/public/image.jpg"),
    path.resolve(__dirname, "../../frontend/public/images/image.jpg"),
    path.resolve(__dirname, "../../frontend/public/images/image.png"),
    path.resolve(__dirname, "../../frontend/public/images/image.webp"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
};

const logoPath = findLogoPath();
const logoAttachments = logoPath
  ? [
      {
        filename: path.basename(logoPath),
        path: logoPath,
        cid: LOGO_CID,
      },
    ]
  : [];

const wrapTemplate = ({ title, subtitle, greeting, bodyHtml, footerText }) => `
  <div style="margin:0;padding:24px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="background:#0f172a;padding:20px 24px;text-align:center;">
          ${logoAttachments.length ? `<img src="cid:${LOGO_CID}" alt="AcadCore" style="max-height:56px;max-width:180px;display:block;margin:0 auto 10px auto;" />` : ""}
          <div style="font-size:21px;font-weight:700;color:#ffffff;">${esc(title)}</div>
          <div style="font-size:13px;color:#cbd5e1;margin-top:6px;">${esc(subtitle)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 14px 0;font-size:15px;color:#1e293b;">${esc(greeting)}</p>
          ${bodyHtml}
          <p style="margin:18px 0 0 0;font-size:12px;color:#64748b;">${esc(footerText)}</p>
        </td>
      </tr>
    </table>
  </div>
`;

export const sendAbsentAttendanceEmails = async ({
  absentEntries = [],
  markedByName = "Staff",
  markedByEmail = "",
}) => {
  const onlyAbsent = (absentEntries || []).filter((x) => String(x.status || "").toUpperCase() === "A");
  if (!onlyAbsent.length) return { sent: 0, skipped: 0 };

  const regnos = [...new Set(onlyAbsent.map((x) => String(x.rollnumber || "").trim()).filter(Boolean))];
  const courseIds = [...new Set(onlyAbsent.map((x) => Number(x.courseId)).filter((x) => Number.isInteger(x)))];

  const [students, userRows, courses] = await Promise.all([
    StudentDetails.findAll({
      where: { registerNumber: regnos },
      attributes: ["registerNumber", "studentName", "personalEmail", "tutorEmail"],
    }),
    User.findAll({
      where: { userNumber: regnos },
      attributes: ["userNumber", "userMail"],
    }),
    Course.findAll({
      where: { courseId: courseIds },
      attributes: ["courseId", "courseCode", "courseTitle"],
    }),
  ]);

  const studentByReg = new Map(students.map((s) => [String(s.registerNumber), s]));
  const userEmailByReg = new Map(userRows.map((u) => [String(u.userNumber), String(u.userMail || "").trim()]));
  const courseById = new Map(courses.map((c) => [Number(c.courseId), c]));

  const mailTasks = [];
  let skipped = 0;

  for (const row of onlyAbsent) {
    const regno = String(row.rollnumber || "").trim();
    const student = studentByReg.get(regno);
    const studentName = student?.studentName || "Student";
    const to = String(student?.personalEmail || "").trim() || userEmailByReg.get(regno) || "";
    if (!isLikelyEmail(to)) {
      skipped += 1;
      continue;
    }

    const course = courseById.get(Number(row.courseId));
    const courseCode = course?.courseCode || "Course";
    const courseTitle = course?.courseTitle || "";
    const sectionLabel = row.sectionId ? `Section ${row.sectionId}` : "Section";
    const periodLabel = row.periodNumber ? `Period ${row.periodNumber}` : "Period";
    const dateLabel = row.date || "";
    const marker = markedByEmail ? `${markedByName} (${markedByEmail})` : markedByName;

    const subject = `Absent Alert: ${courseCode} on ${dateLabel}`;
    const text = `Hi ${studentName},\n\nAttendance marked as ABSENT.\nCourse: ${courseCode}${courseTitle ? ` - ${courseTitle}` : ""}\nDate: ${dateLabel}\n${periodLabel}\n${sectionLabel}\nMarked by: ${marker}\n\nPlease contact your class advisor if this is incorrect.`;

    mailTasks.push(
      sendMail({
        to,
        subject,
        text,
        html: wrapTemplate({
          title: "Attendance Notification",
          subtitle: "Student Absence Alert",
          greeting: `Hi ${studentName},`,
          bodyHtml: `
            <p style="margin:0 0 12px 0;font-size:14px;color:#334155;">Your attendance has been marked as <b style="color:#b91c1c;">ABSENT</b>.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
              <tr><td style="padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:13px;"><b>Course</b></td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;">${esc(courseCode)}${courseTitle ? ` - ${esc(courseTitle)}` : ""}</td></tr>
              <tr><td style="padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:13px;"><b>Date</b></td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;">${esc(dateLabel)}</td></tr>
              <tr><td style="padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:13px;"><b>Period</b></td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;">${esc(periodLabel)}</td></tr>
              <tr><td style="padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:13px;"><b>Section</b></td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;">${esc(sectionLabel)}</td></tr>
              <tr><td style="padding:10px 12px;background:#f8fafc;font-size:13px;"><b>Marked By</b></td><td style="padding:10px 12px;font-size:13px;">${esc(marker)}</td></tr>
            </table>
            <p style="margin:12px 0 0 0;font-size:13px;color:#475569;">If this appears incorrect, please contact your class advisor.</p>
          `,
          footerText: "This is an automated message from AcadCore.",
        }),
        attachments: logoAttachments,
      }).catch(() => {
        skipped += 1;
      })
    );
  }

  await Promise.all(mailTasks);
  return { sent: mailTasks.length, skipped };
};

export const sendUnmarkedAttendanceReminderEmails = async ({ report = [] }) => {
  if (!Array.isArray(report) || report.length === 0) return { sent: 0, skipped: 0 };

  const rowsWithEmail = report.filter((r) => isLikelyEmail(r.StaffEmail));
  if (!rowsWithEmail.length) return { sent: 0, skipped: report.length };

  const groupedByStaff = new Map();
  const now = Date.now();
  let skipped = 0;

  for (const row of rowsWithEmail) {
    const slotKey = `${row.Date}|${row.PeriodNumber}|${row.CourseCode}|${row.Section}|${row.StaffEmail}`;
    const lastSent = reminderSentCache.get(slotKey);
    if (lastSent && now - lastSent < REMINDER_COOLDOWN_MS) {
      skipped += 1;
      continue;
    }

    reminderSentCache.set(slotKey, now);
    const staffEmail = String(row.StaffEmail).trim();
    if (!groupedByStaff.has(staffEmail)) groupedByStaff.set(staffEmail, []);
    groupedByStaff.get(staffEmail).push(row);
  }

  const tasks = [];
  for (const [email, slots] of groupedByStaff.entries()) {
    if (!slots.length) continue;
    const staffName = slots[0].StaffName || "Staff";
    const subject = `Reminder: Unmarked attendance (${slots.length} slot${slots.length > 1 ? "s" : ""})`;
    const textLines = slots.map(
      (s) =>
        `${s.Date} | ${s.Day} | Period ${s.PeriodNumber} | ${s.CourseCode} - ${s.CourseTitle} | ${s.Section}`
    );

    tasks.push(
      sendMail({
        to: email,
        subject,
        text: `Hi ${staffName},\n\nThe following attendance slot(s) are still unmarked:\n\n${textLines.join(
          "\n"
        )}\n\nPlease mark attendance at the earliest.`,
        html: wrapTemplate({
          title: "Attendance Reminder",
          subtitle: "Pending Period Attendance",
          greeting: `Hi ${staffName},`,
          bodyHtml: `
            <p style="margin:0 0 12px 0;font-size:14px;color:#334155;">The following attendance slot(s) are still <b style="color:#b45309;">unmarked</b>:</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
              <tr style="background:#f8fafc;">
                <th align="left" style="padding:10px 12px;font-size:12px;border-bottom:1px solid #e2e8f0;">Date</th>
                <th align="left" style="padding:10px 12px;font-size:12px;border-bottom:1px solid #e2e8f0;">Day</th>
                <th align="left" style="padding:10px 12px;font-size:12px;border-bottom:1px solid #e2e8f0;">Period</th>
                <th align="left" style="padding:10px 12px;font-size:12px;border-bottom:1px solid #e2e8f0;">Course</th>
                <th align="left" style="padding:10px 12px;font-size:12px;border-bottom:1px solid #e2e8f0;">Section</th>
              </tr>
              ${slots
                .map(
                  (s) => `
                    <tr>
                      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">${esc(s.Date)}</td>
                      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">${esc(s.Day)}</td>
                      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">${esc(`Period ${s.PeriodNumber}`)}</td>
                      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">${esc(`${s.CourseCode} - ${s.CourseTitle}`)}</td>
                      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">${esc(s.Section)}</td>
                    </tr>
                  `
                )
                .join("")}
            </table>
            <p style="margin:12px 0 0 0;font-size:13px;color:#475569;">Please mark attendance at the earliest.</p>
          `,
          footerText: "This is an automated reminder from AcadCore.",
        }),
        attachments: logoAttachments,
      }).catch(() => {
        skipped += 1;
      })
    );
  }

  await Promise.all(tasks);
  return { sent: tasks.length, skipped };
};
