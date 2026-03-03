// models/Department.js
export default (sequelize, DataTypes) => {
  const Department = sequelize.define('Department', { 
    departmentId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
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
    // Merged Corporate Fields
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'companies', key: 'companyId' }
    },
    status: {
      type: DataTypes.ENUM('Active', 'Inactive', 'Archived'),
      defaultValue: 'Active'
    },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
    updatedBy: { type: DataTypes.INTEGER, allowNull: true }
  }, { 
    tableName: 'departments', 
    timestamps: true,
    createdAt: 'createdDate',
    updatedAt: 'updatedDate'
  });

  Department.associate = (models) => {
    // Academic Associations
    Department.hasMany(models.Regulation, { foreignKey: 'departmentId' });
    Department.hasMany(models.User, { foreignKey: 'departmentId' });
    Department.hasMany(models.StudentDetails, { foreignKey: 'departmentId' });
    Department.hasMany(models.StaffCourse, { foreignKey: 'departmentId', as: 'staffCourses' });
    Department.hasMany(models.Timetable, { foreignKey: 'departmentId' });
    Department.hasMany(models.PeriodAttendance, { foreignKey: 'departmentId' });
    Department.hasMany(models.CBCS, { foreignKey: 'departmentId' });
    
    // Corporate Associations
    Department.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
    Department.hasMany(models.Employee, { foreignKey: 'departmentId', as: 'employees' });
  };

  return Department;
};
