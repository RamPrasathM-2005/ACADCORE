import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Company = sequelize.define('Company', {
    companyId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    companyName: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    companyAcr: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    logo: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    registrationNumber: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
    },
    pan: {
      type: DataTypes.STRING(10),
      allowNull: true,
      unique: true,
    },
    gst: {
      type: DataTypes.STRING(15),
      allowNull: true,
      unique: true,
    },
    tin: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(15),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: true,
      validate: { isEmail: true },
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    addresses: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
    },
    bankName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    bankAccountNumber: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    bankIfscCode: {
      type: DataTypes.STRING(11),
      allowNull: true,
    },
    financialYearStart: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    financialYearEnd: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    permissionHoursPerMonth: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.ENUM('Active', 'Inactive', 'Suspended'),
      allowNull: false,
      defaultValue: 'Active',
    },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
    updatedBy: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'companies',
    timestamps: true,
    paranoid: true,
  });

  Company.associate = (models) => {
    // Link to Employees
    Company.hasMany(models.Employee, { foreignKey: 'companyId', as: 'employees' });
    
    // Link to the merged DepartmentAcademic table
    Company.hasMany(models.DepartmentAcademic, { foreignKey: 'companyId', as: 'departments' });

    Company.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
    Company.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'updater' });
  };

  return Company;
};