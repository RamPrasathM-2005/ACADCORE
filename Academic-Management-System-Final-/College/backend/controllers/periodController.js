import db from "../models/index.js";
import { Op } from "sequelize";

const { sequelize, Period } = db;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function normalizeTime(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!TIME_PATTERN.test(trimmed)) return null;
  return `${trimmed}:00`;
}

export const getTimetablePeriods = async (req, res) => {
  try {
    const rows = await Period.findAll({
      where: { isActive: "YES" },
      order: [["periodNumber", "ASC"]],
      attributes: ["periodId", "periodNumber", "startTime", "endTime", "isActive"],
    });

    const periods = rows.map((p) => ({
      id: p.periodNumber,
      periodId: p.periodId,
      startTime: String(p.startTime || "").slice(0, 5),
      endTime: String(p.endTime || "").slice(0, 5),
    }));

    res.json({ status: "success", data: periods });
  } catch (err) {
    console.error("getTimetablePeriods error:", err);
    res.status(500).json({ status: "error", message: "Failed to fetch timetable periods" });
  }
};

export const saveTimetablePeriods = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { periods } = req.body;

    if (!Array.isArray(periods) || periods.length === 0) {
      await t.rollback();
      return res.status(400).json({ status: "error", message: "Periods payload is required" });
    }

    const seenNumbers = new Set();
    const normalized = periods.map((item, idx) => {
      const periodNumber = parseInt(item.id, 10);
      const startTime = normalizeTime(item.startTime);
      const endTime = normalizeTime(item.endTime);

      if (!Number.isInteger(periodNumber) || periodNumber < 1 || periodNumber > 12) {
        throw new Error(`Invalid period number at row ${idx + 1}`);
      }
      if (!startTime || !endTime) {
        throw new Error(`Invalid time format at row ${idx + 1}`);
      }
      if (toMinutes(startTime.slice(0, 5)) >= toMinutes(endTime.slice(0, 5))) {
        throw new Error(`Start time must be before end time at row ${idx + 1}`);
      }
      if (seenNumbers.has(periodNumber)) {
        throw new Error(`Duplicate period number ${periodNumber}`);
      }
      seenNumbers.add(periodNumber);

      return { periodNumber, startTime, endTime };
    });

    // Optional strict overlap guard (ordered by start time).
    const sortedByStart = [...normalized].sort(
      (a, b) => toMinutes(a.startTime.slice(0, 5)) - toMinutes(b.startTime.slice(0, 5))
    );
    for (let i = 0; i < sortedByStart.length - 1; i += 1) {
      const currentEnd = toMinutes(sortedByStart[i].endTime.slice(0, 5));
      const nextStart = toMinutes(sortedByStart[i + 1].startTime.slice(0, 5));
      if (currentEnd > nextStart) {
        throw new Error(
          `Time overlap between Period ${sortedByStart[i].periodNumber} and Period ${sortedByStart[i + 1].periodNumber}`
        );
      }
    }

    const actor = req.user?.userNumber || String(req.user?.userId || "system");

    // Mark rows not included as inactive.
    await Period.update(
      { isActive: "NO", updatedBy: actor },
      {
        where: { periodNumber: { [Op.notIn]: normalized.map((p) => p.periodNumber) } },
        transaction: t,
      }
    );

    for (const row of normalized) {
      await Period.upsert(
        {
          periodNumber: row.periodNumber,
          startTime: row.startTime,
          endTime: row.endTime,
          isActive: "YES",
          createdBy: actor,
          updatedBy: actor,
        },
        { transaction: t }
      );
    }

    await t.commit();
    return res.json({
      status: "success",
      message: "Schedule saved successfully",
      data: { count: normalized.length },
    });
  } catch (err) {
    await t.rollback();
    console.error("saveTimetablePeriods error:", err);
    return res.status(400).json({ status: "error", message: err.message || "Failed to save schedule" });
  }
};
