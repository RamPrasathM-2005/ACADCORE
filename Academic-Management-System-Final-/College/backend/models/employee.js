// models/employee.js
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
    departmentId: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      references: { model: 'department', key: 'Deptid' } 
    }, 
    dateOfJoining: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM('Active', 'Inactive'), defaultValue: 'Active' },
  }, {
    tableName: 'staff_details',
    timestamps: true,
    paranoid: true 
  });

  Employee.associate = (models) => {
    Employee.belongsTo(models.User, { foreignKey: 'staffNumber', targetKey: 'userNumber' });
    Employee.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
    Employee.belongsTo(models.DepartmentAcademic, { foreignKey: 'departmentId', as: 'department' });
  };

  return Employee;
};