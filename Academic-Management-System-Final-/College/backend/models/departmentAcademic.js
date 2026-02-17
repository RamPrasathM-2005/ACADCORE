// models/departmentAcademic.js
export default (sequelize, DataTypes) => {
  const DepartmentAcademic = sequelize.define('DepartmentAcademic', { 
    Deptid: { 
      type: DataTypes.INTEGER, 
      primaryKey: true, 
      autoIncrement: true, // Changed to autoIncrement for new records
      allowNull: false 
    },
    Deptname: { 
      type: DataTypes.STRING(100), 
      allowNull: false,
      comment: 'Full name of the department'
    },
    Deptacronym: { 
      type: DataTypes.STRING(10), 
      allowNull: false,
      comment: 'Short code (e.g. CSE, IT)'
    },
    // Added Corporate Fields
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: true, // Nullable initially to prevent errors with existing data
      references: { model: 'companies', key: 'companyId' },
      onDelete: 'CASCADE',
    },
    status: {
      type: DataTypes.ENUM('Active', 'Inactive', 'Archived'),
      allowNull: false,
      defaultValue: 'Active',
    },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
    updatedBy: { type: DataTypes.INTEGER, allowNull: true },
  }, { 
    tableName: 'department', 
    timestamps: true, // Enabled for audit fields
    createdAt: 'createdDate',
    updatedAt: 'updatedDate'
  });

  DepartmentAcademic.associate = (models) => {
    // Your Original Academic Associations
    DepartmentAcademic.hasMany(models.Regulation, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.User, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.StudentDetails, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.StaffCourse, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.Timetable, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.PeriodAttendance, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.CBCS, { foreignKey: 'Deptid' });
    
    // Combined Corporate Associations
    DepartmentAcademic.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
    DepartmentAcademic.hasMany(models.Employee, { foreignKey: 'departmentId', as: 'employees' });
  };

  // Your Seeding Logic
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