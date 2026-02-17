import db from '../models/index.js';
const { Role } = db;
// Get all roles
export const getAllRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({
      include: [
        
        // { model: db.User, as: 'users' }   // ← only include if needed (can be heavy)
      ]
    });
    res.json(roles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get single role by ID
export const getRoleById = async (req, res) => {
  try {
    const role = await Role.findByPk(req.params.id, {
      include: [
        
        // { model: db.User, as: 'users' }
      ]
    });

    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    res.json(role);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create new role
export const createRole = async (req, res) => {
  try {
    const role = await Role.create(req.body);
    res.status(201).json(role);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update role
export const updateRole = async (req, res) => {
  try {
    const [updated] = await Role.update(req.body, {
      where: { roleId: req.params.id }
    });

    if (!updated) {
      return res.status(404).json({ message: 'Role not found' });
    }

    const role = await Role.findByPk(req.params.id);
    res.json(role);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete role (soft delete supported via paranoid: true)
export const deleteRole = async (req, res) => {
  try {
    const deleted = await Role.destroy({
      where: { roleId: req.params.id }
    });

    if (!deleted) {
      return res.status(404).json({ message: 'Role not found' });
    }

    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};