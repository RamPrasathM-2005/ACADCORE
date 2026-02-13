// models/departmentAcademic.js
export default (sequelize, DataTypes) => {
  // The first argument 'DepartmentAcademic' is the internal Sequelize name.
  // This MUST match the keys used in index.js and other associations.
  const DepartmentAcademic = sequelize.define('DepartmentAcademic', { 
    Deptid: { 
      type: DataTypes.INTEGER, 
      primaryKey: true, 
      allowNull: false 
    },
    Deptname: { 
      type: DataTypes.STRING(100), 
      allowNull: false 
    },
    Deptacronym: { 
      type: DataTypes.STRING(10), 
      allowNull: false 
    },
  }, { 
    tableName: 'department', // Physical table name in MySQL
    timestamps: false 
  });

  DepartmentAcademic.associate = (models) => {
    // Note: These model names (Regulation, User, etc.) must match 
    // the name inside their respective define() functions.
    DepartmentAcademic.hasMany(models.Regulation, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.User, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.StudentDetails, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.StaffCourse, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.Timetable, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.PeriodAttendance, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.CBCS, { foreignKey: 'Deptid' });
  };

  // Initial Seeding Logic
  // This runs whenever the model is loaded. 
  // ignoreDuplicates: true prevents errors if the IDs already exist.
  DepartmentAcademic.afterSync(async () => {
    try {
      await DepartmentAcademic.bulkCreate([
        { Deptid: 1, Deptname: 'Computer Science Engineering', Deptacronym: 'CSE' },
        { Deptid: 2, Deptname: 'Electronics & Communication', Deptacronym: 'ECE' },
        { Deptid: 3, Deptname: 'Mechanical Engineering', Deptacronym: 'MECH' },
        { Deptid: 4, Deptname: 'Information Technology', Deptacronym: 'IT' },
        { Deptid: 5, Deptname: 'Electrical Engineering', Deptacronym: 'EEE' },
        { Deptid: 6, Deptname: 'Artificial Intelligence and Data Science', Deptacronym: 'AIDS' },
        { Deptid: 7, Deptname: 'Civil Engineering', Deptacronym: 'CIVIL' },
      ], { ignoreDuplicates: true });
    } catch (error) {
      console.log('Department seeding skipped or failed:', error.message);
    }
  });

  return DepartmentAcademic;
};