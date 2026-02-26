import React, { useState } from "react";
import { api } from "../../services/authService"; // Import your custom api instance

const PeriodManager = () => {
  const [numPeriods, setNumPeriods] = useState(0);
  const [periods, setPeriods] = useState([]);

  const handleCountChange = (e) => {
    const count = parseInt(e.target.value) || 0;
    setNumPeriods(count);

    setPeriods((prev) => {
      const newPeriods = [...prev];
      if (count > prev.length) {
        for (let i = prev.length; i < count; i++) {
          newPeriods.push({ id: i + 1, startTime: "", endTime: "" });
        }
      } else {
        return newPeriods.slice(0, count);
      }
      return newPeriods;
    });
  };

  const handleTimingChange = (index, field, value) => {
    const updatedPeriods = [...periods];
    updatedPeriods[index][field] = value;
    setPeriods(updatedPeriods);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate that all times are filled
    const isValid = periods.every((p) => p.startTime && p.endTime);
    if (!isValid) {
      alert("Please fill in all start and end times.");
      return;
    }

    try {
      // Use the 'api' instance. Interceptor handles the token automatically.
      // Endpoint is just '/admin/timetable-periods' because baseURL has '/api'
      const response = await api.post("/admin/timetable-periods", { periods });

      // Axios returns data in 'data'. Checking for success status.
      if (response.status === 200 || response.data.status === "success") {
        alert("Schedule saved to database!");
      }
    } catch (error) {
      console.error("API error:", error.response?.data || error.message);
      alert(
        error.response?.data?.message || "Could not connect to the server.",
      );
    }
  };

  return (
    <div className="min-h-screen bg-white p-8 font-sans">
      <div className="flex flex-col items-center justify-center mb-12">
        <div className="w-20 h-20 border-2 border-slate-800 rounded-full flex items-center justify-center mb-4">
          <svg
            className="w-12 h-12 text-slate-800"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 14l9-5-9-5-9 5 9 5z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 14l9-5-9-5-9 5 9 5zm0 0v6m-3-3l3 3 3-3"
            />
          </svg>
        </div>
        <h1 className="text-4xl font-black italic tracking-tighter text-slate-900 uppercase">
          Admin Attendance
        </h1>
      </div>

      <div className="max-w-5xl mx-auto border-t border-gray-100 pt-10">
        <div className="flex flex-col gap-2 mb-10 w-full md:w-64">
          <label className="text-xs font-black uppercase tracking-widest text-slate-900">
            Number of Periods
          </label>
          <input
            type="number"
            min="0"
            max="12"
            value={numPeriods}
            onChange={handleCountChange}
            placeholder="e.g. 5"
            className="w-full p-3 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black appearance-none"
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {periods.map((period, index) => (
            <div
              key={period.id}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end border-b border-gray-50 pb-6"
            >
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Period Slot
                </label>
                <div className="p-3 bg-gray-50 border border-transparent rounded-md font-bold text-slate-700">
                  Period {period.id}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-900">
                  Start Time
                </label>
                <input
                  type="time"
                  required
                  value={period.startTime}
                  onChange={(e) =>
                    handleTimingChange(index, "startTime", e.target.value)
                  }
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-900">
                  End Time
                </label>
                <input
                  type="time"
                  required
                  value={period.endTime}
                  onChange={(e) =>
                    handleTimingChange(index, "endTime", e.target.value)
                  }
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
            </div>
          ))}

          {numPeriods > 0 && (
            <div className="pt-4">
              <button
                type="submit"
                className="bg-black text-white px-10 py-4 rounded-md font-black text-sm tracking-widest hover:bg-gray-800 transition-all uppercase"
              >
                Save Schedule
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default PeriodManager;
