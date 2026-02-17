// models/departmentAcademic.js
export default (sequelize, DataTypes) => {
  const DepartmentAcademic = sequelize.define('DepartmentAcademic', { 
    Deptid: { 
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

  DepartmentAcademic.associate = (models) => {
    // Academic Associations
    DepartmentAcademic.hasMany(models.Regulation, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.User, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.StudentDetails, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.StaffCourse, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.Timetable, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.PeriodAttendance, { foreignKey: 'Deptid' });
    DepartmentAcademic.hasMany(models.CBCS, { foreignKey: 'Deptid' });
    
    // Corporate Associations
    DepartmentAcademic.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
    DepartmentAcademic.hasMany(models.Employee, { foreignKey: 'departmentId', as: 'employees' });
  };

  return DepartmentAcademic;
};