'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('invoices', {
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
      client_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'clients', key: 'id' },
        onDelete: 'RESTRICT',
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      invoice_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Unique per company, e.g. INV-2026-0001',
      },
      invoice_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      due_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('draft', 'submitted', 'verified', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft',
      },
      payment_status: {
        type: Sequelize.ENUM('unpaid', 'partial', 'paid', 'overdue'),
        allowNull: false,
        defaultValue: 'unpaid',
      },
      subtotal: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      discount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      tax_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      total_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      fbr_invoice_number: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Assigned by FBR on successful submission',
      },
      fbr_status: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'FBR response status string',
      },
      qr_code_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    })

    await queryInterface.addIndex('invoices', ['company_id'])
    await queryInterface.addIndex('invoices', ['client_id'])
    await queryInterface.addIndex('invoices', ['company_id', 'invoice_number'], { unique: true })
    await queryInterface.addIndex('invoices', ['company_id', 'status'])
    await queryInterface.addIndex('invoices', ['company_id', 'payment_status'])
    await queryInterface.addIndex('invoices', ['company_id', 'invoice_date'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('invoices')
  },
}
