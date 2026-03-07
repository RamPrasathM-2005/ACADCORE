export default (sequelize, DataTypes) => {
  const Department = sequelize.define(
    "Department",
    {
      departmentId: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      departmentName: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Full name of the department (e.g. Computer Science)",
      },
      departmentAcr: {
        type: DataTypes.STRING(10),
        allowNull: false,
        comment: "Short code / acronym (e.g. CSE, ECE)",
      },
      Deptname: {
        type: DataTypes.VIRTUAL,
        get() {
          return this.getDataValue("departmentName");
        },
        set(value) {
          this.setDataValue("departmentName", value);
        },
      },
      Deptacronym: {
        type: DataTypes.VIRTUAL,
        get() {
          return this.getDataValue("departmentAcr");
        },
        set(value) {
          this.setDataValue("departmentAcr", value);
        },
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "companies",
          key: "companyId",
        },
        onDelete: "CASCADE",
      },
      status: {
        type: DataTypes.ENUM("Active", "Inactive", "Archived"),
        allowNull: false,
        defaultValue: "Active",
      },
      createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "userId",
        },
        onDelete: "SET NULL",
      },
      updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "userId",
        },
        onDelete: "SET NULL",
      },
    },
    {
      tableName: "departments",
      timestamps: true,
      paranoid: true,
      indexes: [
        {
          unique: true,
          fields: ["companyId", "departmentName"],
          name: "unique_company_department_name",
        },
        {
          unique: true,
          fields: ["companyId", "departmentAcr"],
          name: "unique_company_department_acr",
        },
        {
          fields: ["companyId", "status"],
          name: "idx_company_department_status",
        },
        {
          fields: ["status"],
          name: "idx_department_status",
        },
      ],
    }
  );

  Department.prototype.toJSON = function toJSON() {
    const values = { ...this.get() };
    values.Deptname = values.departmentName;
    values.Deptacronym = values.departmentAcr;
    return values;
  };

  Department.associate = (models) => {
    Department.belongsTo(models.Company, {
      foreignKey: "companyId",
      as: "company",
    });

    Department.belongsTo(models.User, {
      foreignKey: "createdBy",
      as: "creator",
    });

    Department.belongsTo(models.User, {
      foreignKey: "updatedBy",
      as: "updater",
    });

    Department.hasMany(models.Employee, {
      foreignKey: "departmentId",
      as: "employees",
    });

    Department.hasMany(models.Regulation, {
      foreignKey: "departmentId",
      as: "regulations",
    });

    Department.hasMany(models.User, {
      foreignKey: "departmentId",
      as: "users",
    });

    Department.hasMany(models.StudentDetails, {
      foreignKey: "departmentId",
      as: "students",
    });

    Department.hasMany(models.StaffCourse, {
      foreignKey: "departmentId",
      as: "staffCourses",
    });

    Department.hasMany(models.Timetable, {
      foreignKey: "departmentId",
      as: "timetables",
    });

    Department.hasMany(models.PeriodAttendance, {
      foreignKey: "departmentId",
      as: "periodAttendances",
    });

    Department.hasMany(models.CBCS, {
      foreignKey: "departmentId",
      as: "cbcs",
    });
  };

  return Department;
};
