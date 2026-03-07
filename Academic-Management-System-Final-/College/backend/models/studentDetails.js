export default (sequelize, DataTypes) => {
  const StudentDetails = sequelize.define("StudentDetails", {
    studentId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    studentName: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    registerNumber: {
      type: DataTypes.STRING(50),
      unique: true,
      allowNull: false,
      references: {
        model: "users",
        key: "userNumber",
      },
    },
    departmentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "departments",
        key: "departmentId",
      },
    },
    batch: { type: DataTypes.INTEGER },
    semester: { type: DataTypes.STRING(255) },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "companies",
        key: "companyId",
      },
      onDelete: "CASCADE",
    },
    staffId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "staff_details",
        key: "staffId",
      },
      onDelete: "SET NULL",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      references: {
        model: "users",
        key: "userId",
      },
      field: "created_by",
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      references: {
        model: "users",
        key: "userId",
      },
      field: "updated_by",
    },
    dateOfJoining: { type: DataTypes.DATE },
    dateOfBirth: { type: DataTypes.DATE },
    bloodGroup: {
      type: DataTypes.ENUM("A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"),
    },
    tutorEmail: {
      type: DataTypes.STRING,
      validate: { isEmail: true },
    },
    personalEmail: {
      type: DataTypes.STRING,
      validate: { isEmail: true },
    },
    firstGraduate: {
      type: DataTypes.ENUM("Yes", "No"),
    },
    aadharCardNo: {
      type: DataTypes.STRING(12),
      unique: true,
    },
    studentType: {
      type: DataTypes.ENUM("Day-Scholar", "Hosteller"),
    },
    motherTongue: { type: DataTypes.STRING },
    identificationMark: { type: DataTypes.STRING },
    religion: {
      type: DataTypes.ENUM("Hindu", "Muslim", "Christian", "Others"),
    },
    caste: { type: DataTypes.STRING },
    community: {
      type: DataTypes.ENUM("General", "OBC", "SC", "ST", "Others"),
    },
    gender: {
      type: DataTypes.ENUM("Male", "Female", "Transgender"),
    },
    seatType: {
      type: DataTypes.ENUM("Counselling", "Management"),
    },
    section: { type: DataTypes.STRING },
    doorNo: { type: DataTypes.STRING(255) },
    street: { type: DataTypes.STRING(255) },
    city: { type: DataTypes.STRING(255) },
    pincode: {
      type: DataTypes.STRING(6),
      validate: { is: /^[0-9]{6}$/ },
    },
    personalPhone: {
      type: DataTypes.STRING(10),
      validate: { is: /^[6-9]\d{9}$/ },
    },
    pending: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    tutorApprovalStatus: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    approvedBy: {
      type: DataTypes.INTEGER,
      references: {
        model: "staff_details",
        key: "staffId",
      },
      field: "approved_by",
    },
    approvedAt: { type: DataTypes.DATE },
    messages: { type: DataTypes.JSON },
    skillrackProfile: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  }, {
    tableName: "student_details",
    timestamps: true,
  });

  StudentDetails.associate = (models) => {
    StudentDetails.belongsTo(models.Department, {
      foreignKey: "departmentId",
      as: "department",
    });

    StudentDetails.belongsTo(models.Company, {
      foreignKey: "companyId",
      as: "company",
    });

    StudentDetails.belongsTo(models.Employee, {
      foreignKey: "staffId",
      as: "staff",
    });

    StudentDetails.belongsTo(models.User, {
      foreignKey: "createdBy",
      as: "creator",
    });

    StudentDetails.belongsTo(models.User, {
      foreignKey: "updatedBy",
      as: "updater",
    });

    StudentDetails.belongsTo(models.Employee, {
      foreignKey: "approvedBy",
      as: "approver",
    });

    StudentDetails.belongsTo(models.User, {
      foreignKey: "registerNumber",
      targetKey: "userNumber",
      as: "user",
    });

    const commonOptions = {
      foreignKey: "regno",
      sourceKey: "registerNumber",
    };

    StudentDetails.hasMany(models.StudentCourse, commonOptions);
    StudentDetails.hasMany(models.StudentCOTool, commonOptions);
    StudentDetails.hasMany(models.DayAttendance, commonOptions);
    StudentDetails.hasMany(models.PeriodAttendance, commonOptions);
    StudentDetails.hasMany(models.StudentCoMarks, commonOptions);
    StudentDetails.hasMany(models.StudentElectiveSelection, commonOptions);
    StudentDetails.hasMany(models.StudentNptelEnrollment, commonOptions);
    StudentDetails.hasMany(models.NptelCreditTransfer, commonOptions);
    StudentDetails.hasMany(models.StudentGrade, commonOptions);
    StudentDetails.hasMany(models.StudentSemesterGPA, commonOptions);
    StudentDetails.hasMany(models.studentcourseChoices, commonOptions);
    StudentDetails.hasMany(models.studentTempChoice, commonOptions);
  };

  return StudentDetails;
};
