'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users')

    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_users_role') THEN
          ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'super_admin';
          ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'company_admin';
          ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'accountant';
        END IF;
      END
      $$;
    `)

    if (!table.role_id) {
      await queryInterface.addColumn('users', 'role_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'roles', key: 'id' },
        onDelete: 'SET NULL',
      })
    }

    if (!table.email_verified_at) {
      await queryInterface.addColumn('users', 'email_verified_at', {
        type: Sequelize.DATE,
        allowNull: true,
      })
    }

    if (table.company_id && table.company_id.allowNull === false) {
      await queryInterface.changeColumn('users', 'company_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      })
    }

    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS users_role_id_idx ON users (role_id);'
    )
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS users_email_verified_at_idx ON users (email_verified_at);'
    )
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users')

    await queryInterface.sequelize.query('DROP INDEX IF EXISTS users_email_verified_at_idx;')
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS users_role_id_idx;')

    if (table.email_verified_at) {
      await queryInterface.removeColumn('users', 'email_verified_at')
    }

    if (table.role_id) {
      await queryInterface.removeColumn('users', 'role_id')
    }

    if (table.company_id && table.company_id.allowNull === true) {
      const rows = await queryInterface.sequelize.query(
        'SELECT COUNT(*)::int AS count FROM users WHERE company_id IS NULL;',
        { type: Sequelize.QueryTypes.SELECT }
      )

      if (rows[0].count === 0) {
        await queryInterface.changeColumn('users', 'company_id', {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'companies', key: 'id' },
          onDelete: 'CASCADE',
        })
      }
    }
  },
}
