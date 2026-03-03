// models/timetable.js
export default  (sequelize, DataTypes) => {
  const Timetable = sequelize.define('Timetable', {
    timetableId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    sectionId: { type: DataTypes.INTEGER, allowNull: true },
    dayOfWeek: { type: DataTypes.ENUM('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'), allowNull: false },
    periodNumber: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 12 } },
    departmentId: { type: DataTypes.INTEGER, allowNull: false },
    semesterId: { type: DataTypes.INTEGER, allowNull: false },
    isActive: { type: DataTypes.ENUM('YES', 'NO'), defaultValue: 'YES' },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'Timetable', timestamps: true, createdAt: 'createdDate', updatedAt: 'updatedDate' });

  Timetable.associate = (models) => {
    Timetable.belongsTo(models.Department, { foreignKey: 'departmentId' });
    Timetable.belongsTo(models.Semester, { foreignKey: 'semesterId' });
    Timetable.belongsTo(models.Course, { foreignKey: 'courseId' });
    Timetable.belongsTo(models.Section, { foreignKey: 'sectionId' });
    // Compatibility association for legacy includes that use `model: StaffCourse`
    // without an alias.
    Timetable.hasMany(models.StaffCourse, {
      foreignKey: 'courseId',
      sourceKey: 'courseId',
      constraints: false
    });
    // Virtual relation for timetable filtering by staff allocation.
    // Joined by courseId; section matching is handled at query level.
    Timetable.hasMany(models.StaffCourse, {
      foreignKey: 'courseId',
      sourceKey: 'courseId',
      constraints: false,
      as: 'teachingAssignments'
    });
  };

  return Timetable;
};

