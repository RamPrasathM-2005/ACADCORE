import { DataTypes } from "sequelize";

export default (sequelize) => {
  const Employee = sequelize.define('Employee', {
    staffId: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    staffNumber: { 
      type: DataTypes.STRING, 
      allowNull: false, 
      unique: true,
      references: { model: 'users', key: 'userNumber' } 
    },
    firstName: { type: DataTypes.STRING(50), allowNull: false },
    lastName: { type: DataTypes.STRING(50), allowNull: true },
    gender: { type: DataTypes.ENUM('Male', 'Female', 'Other'), allowNull: true },
    personalEmail: { type: DataTypes.STRING(150), allowNull: false },
    officialEmail: { type: DataTypes.STRING(150), allowNull: true },
    departmentId: { type: DataTypes.INTEGER, allowNull: false },
    dateOfJoining: { type: DataTypes.DATEONLY, allowNull: false },
    employmentStatus: { 
        type: DataTypes.ENUM('Active', 'Resigned', 'Terminated', 'On Leave'), 
        defaultValue: 'Active' 
    },
    status: { type: DataTypes.ENUM('Active', 'Inactive'), defaultValue: 'Active' },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
    updatedBy: { type: DataTypes.INTEGER, allowNull: true },
    // Academic/Research IDs
    annaUniversityFacultyId: { type: DataTypes.STRING(100) },
    aicteFacultyId: { type: DataTypes.STRING(100) },
    googleScholarId: { type: DataTypes.STRING(100) }
  }, {
    tableName: 'staff_details',
    timestamps: true,
    paranoid: true 
  });

  Employee.associate = (models) => {
    // 1. Check User model name (should be 'User')
    Employee.belongsTo(models.User, { foreignKey: 'staffNumber', targetKey: 'userNumber' });
    
    // 2. FIXED: Changed models.Department to models.DepartmentAcademic
    Employee.belongsTo(models.DepartmentAcademic, { foreignKey: 'departmentId', as: 'department' });
  };

  return Employee;
};