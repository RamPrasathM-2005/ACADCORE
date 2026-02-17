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
    companyId: { 
      type: DataTypes.INTEGER, 
      allowNull: true, 
      references: { model: 'companies', key: 'companyId' } 
    },
    firstName: { type: DataTypes.STRING(50), allowNull: false },
    lastName: { type: DataTypes.STRING(50), allowNull: true },
    gender: { type: DataTypes.ENUM('Male', 'Female', 'Other'), allowNull: true },
    personalEmail: { type: DataTypes.STRING(150), allowNull: false },
    officialEmail: { type: DataTypes.STRING(150), allowNull: true },
    
    // Links to Deptid in your combined DepartmentAcademic model
    departmentId: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      references: { model: 'department', key: 'Deptid' } 
    }, 
    
    dateOfJoining: { type: DataTypes.DATEONLY, allowNull: false },
    employmentStatus: { 
        type: DataTypes.ENUM('Active', 'Resigned', 'Terminated', 'On Leave'), 
        defaultValue: 'Active' 
    },
    status: { type: DataTypes.ENUM('Active', 'Inactive'), defaultValue: 'Active' },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
    updatedBy: { type: DataTypes.INTEGER, allowNull: true },
    
    // Academic IDs
    annaUniversityFacultyId: { type: DataTypes.STRING(100) },
    aicteFacultyId: { type: DataTypes.STRING(100) },
    googleScholarId: { type: DataTypes.STRING(100) }
  }, {
    tableName: 'staff_details',
    timestamps: true,
    paranoid: true 
  });

  Employee.associate = (models) => {
    // Link to User
    Employee.belongsTo(models.User, { foreignKey: 'staffNumber', targetKey: 'userNumber' });
    
    // Link to Company
    Employee.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });

    // Link to the Combined Department Table
    Employee.belongsTo(models.DepartmentAcademic, { 
        foreignKey: 'departmentId', 
        as: 'department' 
    });
  };

  return Employee;
};