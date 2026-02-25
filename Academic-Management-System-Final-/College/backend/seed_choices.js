import db from './models/index.js'; // Adjust path to your models folder
const { studentTempChoice } = db;

// 1. DATA: List of all 120 RegNos from your dump
const students = [
  "2312001", "2312002", "2312003", "2312005", "2312006", "2312007", "2312008", "2312009", "2312010", "2312011",
  "2312012", "2312013", "2312014", "2312015", "2312016", "2312017", "2312018", "2312019", "2312020", "2312021",
  "2312022", "2312023", "2312024", "2312025", "2312026", "2312027", "2312028", "2312029", "2312030", "2312031",
  "2312032", "2312033", "2312034", "2312035", "2312036", "2312037", "2312038", "2312039", "2312040", "2312041",
  "2312042", "2312043", "2312044", "2312045", "2312046", "2312047", "2312048", "2312049", "2312050", "2312051",
  "2312052", "2312053", "2312054", "2312055", "2312056", "2312057", "2312058", "2312060", "2312061", "2312062",
  "2312063", "2312064", "2312065", "2312066", "2312067", "2312069", "2312070", "2312071", "2312072", "2312073",
  "2312075", "2312076", "2312077", "2312078", "2312079", "2312080", "2312081", "2312082", "2312084", "2312085",
  "2312086", "2312087", "2312088", "2312089", "2312090", "2312091", "2312092", "2312093", "2312094", "2312095",
  "2312096", "2312097", "2312098", "2312099", "2312100", "2312101", "2312102", "2312103", "2312104", "2312105",
  "2312106", "2312107", "2312108", "2312109", "2312111", "2312112", "2312113", "2312114", "2312116", "2312118",
  "2312119", "2312120", "2312121", "2312122", "2312123", "2312124", "2312125", "2312126", "2312127", "2312128",
  "2212110", "2312401", "2312402", "2312403", "2312404", "2312405", "2312406", "2312407", "2312408"
];

// 2. CONFIG: Map Courses to their available Sections and Staff
// (Derived from your CBCSSectionStaff table data)
const courseConfig = [
  { 
    courseId: 18, 
    sections: [ { secId: 1, staffId: 157 }, { secId: 2, staffId: 136 }, { secId: 3, staffId: 143 } ] 
  },
  { 
    courseId: 19, 
    sections: [ { secId: 1, staffId: 134 }, { secId: 2, staffId: 141 }, { secId: 3, staffId: 146 } ] 
  },
  { 
    courseId: 20, 
    sections: [ { secId: 1, staffId: 203 }, { secId: 2, staffId: 202 }, { secId: 3, staffId: 137 } ] 
  },
  { 
    courseId: 21, 
    sections: [ { secId: 1, staffId: 152 }, { secId: 2, staffId: 144 } ] // Only 2 sections
  },
  { 
    courseId: 23, 
    sections: [ { secId: 1, staffId: 142 }, { secId: 2, staffId: 143 }, { secId: 3, staffId: 148 } ] 
  },
  { 
    courseId: 24, 
    sections: [ { secId: 1, staffId: 137 }, { secId: 2, staffId: 138 }, { secId: 3, staffId: 152 } ] 
  },
  { 
    courseId: 25, 
    sections: [ { secId: 1, staffId: 134 }, { secId: 2, staffId: 141 }, { secId: 3, staffId: 146 } ] 
  },
  { 
    courseId: 26, 
    sections: [ { secId: 1, staffId: 203 }, { secId: 2, staffId: 202 }, { secId: 3, staffId: 137 } ] 
  },
  { 
    courseId: 27, 
    sections: [ { secId: 1, staffId: 203 }, { secId: 2, staffId: 135 } ] // Only 2 sections
  }
];

const CBCS_ID = 1;

const seedChoices = async () => {
  try {
    const payload = [];

    // Loop through every student
    students.forEach((regno, studentIndex) => {
      
      // Loop through every course for this student
      courseConfig.forEach((course) => {
        
        // LOGIC: Round Robin Distribution
        // Student 0 -> Section 1, Student 1 -> Section 2, Student 2 -> Section 3, Student 3 -> Section 1...
        const sectionIndex = studentIndex % course.sections.length;
        const assigned = course.sections[sectionIndex];

        payload.push({
          regno: regno,
          cbcs_id: CBCS_ID,
          courseId: course.courseId,
          preferred_sectionId: assigned.secId,
          preferred_staffId: assigned.staffId,
          preference_order: 1, // Primary choice
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'Seeder'
        });
      });
    });

    console.log(`Prepared ${payload.length} rows for insertion...`);
    
    // Insert in chunks to avoid packet size errors
    await studentTempChoice.bulkCreate(payload);
    
    console.log('✅ Successfully inserted all student choices!');
  } catch (error) {
    console.error('❌ Error seeding choices:', error);
  } finally {
    process.exit();
  }
};

seedChoices();