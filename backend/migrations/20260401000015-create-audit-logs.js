'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('audit_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      action: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'e.g. INVOICE_CREATED, CLIENT_UPDATED, LOGIN_SUCCESS',
      },
      entity_type: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'e.g. Invoice, Client, User',
      },
      entity_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      old_values: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Previous state — passwords/tokens must be masked',
      },
      new_values: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'New state — passwords/tokens must be masked',
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    })

    await queryInterface.addIndex('audit_logs', ['company_id'])
    await queryInterface.addIndex('audit_logs', ['company_id', 'created_at'])
    await queryInterface.addIndex('audit_logs', ['entity_type', 'entity_id'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_logs')
  },
}
