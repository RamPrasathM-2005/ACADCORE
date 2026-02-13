import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Role = sequelize.define('Role', {
    roleId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    roleName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      // Fixed: unique: true is enough to handle the name. 
      // Sequelize will manage the index name automatically.
      unique: true, 
      comment: 'Role name (e.g. "Staff", "Admin", "Department Admin")',
    },

    status: {
      type: DataTypes.ENUM('Active', 'Inactive'),
      allowNull: false,
      defaultValue: 'Active',
    },

    // Audit fields (Preserved exactly as requested)
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'userId',
      },
      onDelete: 'SET NULL',
    },

    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'userId',
      },
      onDelete: 'SET NULL',
    },

  }, {
    tableName: 'roles',
    timestamps: true,
    paranoid: true,
    // Preserve manual indexes but ensure they don't clash
    indexes: [
      {
        fields: ['status'],
        name: 'idx_role_status',
      },
    ],
  });

  // Associations (Preserved exactly as requested)
  Role.associate = (models) => {
    Role.belongsTo(models.User, {
      as: 'Creator',
      foreignKey: 'createdBy',
    });

    Role.belongsTo(models.User, {
      as: 'Updater',
      foreignKey: 'updatedBy',
    });

    Role.hasMany(models.User, {
      as: 'users',
      foreignKey: 'roleId',
    });
  };

  return Role;
};