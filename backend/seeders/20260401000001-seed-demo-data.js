'use strict'

const { v4: uuidv4 } = require('uuid')
const bcrypt = require('bcryptjs')

const TAX_RATE_TEMPLATES = [
  { label: 'Exempt (0%)', rate: 0.0, is_default: false },
  { label: 'Reduced GST (5%)', rate: 5.0, is_default: false },
  { label: 'Reduced GST (10%)', rate: 10.0, is_default: false },
  { label: 'Standard GST (17%)', rate: 17.0, is_default: true },
]

const INVOICE_STATUSES = [
  'draft',
  'sent',
  'paid',
  'overdue',
  'cancelled',
  'sent',
  'partially_paid',
  'draft',
  'sent',
  'paid',
]

const PAYMENT_STATUSES = [
  'unpaid',
  'partial',
  'paid',
  'overdue',
  'unpaid',
  'partial',
  'paid',
  'unpaid',
  'partial',
  'paid',
]

function dateOnly(date) {
  return date.toISOString().slice(0, 10)
}

function addDays(baseDate, days) {
  const d = new Date(baseDate)
  d.setDate(d.getDate() + days)
  return d
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date()
    const currentYear = now.getFullYear()

    const companies = [
      {
        id: uuidv4(),
        name: 'Demo Company (Pvt) Ltd',
        ntn: '1234567',
        strn: '12-34-5678-001-23',
        address: '123 Main Street, Blue Area, Islamabad',
        email: 'info@democompany.pk',
        phone: '051-1234567',
        logo_url: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: uuidv4(),
        name: 'Second Demo Traders',
        ntn: '2234567',
        strn: '22-34-5678-001-23',
        address: '45 Business District, Lahore',
        email: 'accounts@second-demo.pk',
        phone: '042-7654321',
        logo_url: null,
        created_at: now,
        updated_at: now,
      },
    ]

    await queryInterface.bulkInsert('companies', companies)

    await queryInterface.bulkInsert(
      'company_settings',
      companies.map((company, idx) => ({
        id: uuidv4(),
        company_id: company.id,
        invoice_prefix: idx === 0 ? 'INV-A' : 'INV-B',
        invoice_counter: 11,
        invoice_format: '{PREFIX}-{YYYY}-{NNNN}',
        payment_terms_days: 30,
        created_at: now,
        updated_at: now,
      }))
    )

    const roles = [
      { id: uuidv4(), name: 'super_admin', description: 'Full system access' },
      { id: uuidv4(), name: 'company_admin', description: 'Company-level admin' },
      { id: uuidv4(), name: 'seller', description: 'Invoice creator and submitter' },
      { id: uuidv4(), name: 'accountant', description: 'Payments and reports access' },
    ]

    await queryInterface.bulkInsert(
      'roles',
      roles.map(role => ({
        id: role.id,
        name: role.name,
        description: role.description,
        created_at: now,
        updated_at: now,
      }))
    )

    const permissions = [
      'manage_companies',
      'manage_users',
      'create_edit_invoices',
      'delete_invoices',
      'submit_to_fbr',
      'manage_tax_rates',
      'view_reports',
      'view_audit_logs',
      'system_settings',
      'manage_backups',
    ]

    await queryInterface.bulkInsert(
      'permissions',
      permissions.map(name => ({
        id: uuidv4(),
        name,
        description: name.replace(/_/g, ' '),
        created_at: now,
        updated_at: now,
      }))
    )

    const passwordHash = await bcrypt.hash('Admin@1234', 12)

    const users = [
      {
        id: uuidv4(),
        company_id: companies[0].id,
        name: 'Super Admin',
        email: 'admin@fbr.local',
        password_hash: passwordHash,
        role: 'admin',
        is_active: true,
        failed_attempts: 0,
        locked_until: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: uuidv4(),
        company_id: companies[1].id,
        name: 'Second Company Seller',
        email: 'seller@second-demo.pk',
        password_hash: passwordHash,
        role: 'seller',
        is_active: true,
        failed_attempts: 0,
        locked_until: null,
        created_at: now,
        updated_at: now,
      },
    ]

    await queryInterface.bulkInsert('users', users)

    const superAdminRole = roles.find(role => role.name === 'super_admin')
    const sellerRole = roles.find(role => role.name === 'seller')

    await queryInterface.bulkInsert('role_user', [
      {
        id: uuidv4(),
        role_id: superAdminRole.id,
        user_id: users[0].id,
        created_at: now,
      },
      {
        id: uuidv4(),
        role_id: sellerRole.id,
        user_id: users[1].id,
        created_at: now,
      },
    ])

    const taxRates = companies.flatMap(company =>
      TAX_RATE_TEMPLATES.map(tr => ({
        id: uuidv4(),
        company_id: company.id,
        label: tr.label,
        rate: tr.rate,
        is_default: tr.is_default,
        is_active: true,
        created_at: now,
        updated_at: now,
      }))
    )

    await queryInterface.bulkInsert('tax_rates', taxRates)

    const clients = []
    const companyClientMap = new Map()

    companies.forEach((company, companyIndex) => {
      const creatorId = users[companyIndex].id
      const companyCode = companyIndex + 1
      const companyClients = []

      for (let i = 1; i <= 5; i += 1) {
        const client = {
          id: uuidv4(),
          company_id: company.id,
          name: `Client ${companyCode}-${i}`,
          client_type: i % 2 === 0 ? 'individual' : 'business',
          ntn: `${companyCode}${String(i).padStart(6, '0')}`,
          cnic: `${3520200000000 + companyCode * 100 + i}`,
          email: `client${companyCode}${i}@example.com`,
          phone: `0300${String(companyCode * 10000 + i).padStart(7, '0')}`,
          address: `Street ${i}, Company ${companyCode} City`,
          city: companyIndex === 0 ? 'Islamabad' : 'Lahore',
          province: companyIndex === 0 ? 'ICT' : 'Punjab',
          postal_code: companyIndex === 0 ? '44000' : '54000',
          country: 'Pakistan',
          payment_terms_days: 30,
          status: 'active',
          created_by: creatorId,
          created_at: now,
          updated_at: now,
        }

        clients.push(client)
        companyClients.push(client)
      }

      companyClientMap.set(company.id, companyClients)
    })

    await queryInterface.bulkInsert('clients', clients)

    const invoices = []
    const invoiceItems = []

    companies.forEach((company, companyIndex) => {
      const creatorId = users[companyIndex].id
      const prefix = companyIndex === 0 ? 'INV-A' : 'INV-B'
      const companyClients = companyClientMap.get(company.id)

      for (let i = 0; i < 10; i += 1) {
        const invoiceId = uuidv4()
        const issueDate = addDays(now, -40 + i * 2)
        const dueDate = addDays(issueDate, 15)
        const subtotal = 12000 + i * 1350 + companyIndex * 500
        const discount = i % 4 === 0 ? 750 : 0
        const taxRate = i % 2 === 0 ? 17 : 5
        const taxAmount = Number((((subtotal - discount) * taxRate) / 100).toFixed(2))
        const totalAmount = Number((subtotal - discount + taxAmount).toFixed(2))
        const status = INVOICE_STATUSES[i]
        const paymentStatus = PAYMENT_STATUSES[i]

        invoices.push({
          id: invoiceId,
          company_id: company.id,
          client_id: companyClients[i % companyClients.length].id,
          seller_id: creatorId,
          created_by: creatorId,
          invoice_number: `${prefix}-${currentYear}-${String(i + 1).padStart(4, '0')}`,
          issue_date: dateOnly(issueDate),
          invoice_date: dateOnly(issueDate),
          due_date: dateOnly(dueDate),
          status,
          payment_status: paymentStatus,
          currency: 'PKR',
          subtotal,
          discount_type: discount > 0 ? 'fixed' : null,
          discount_value: discount,
          discount_amount: discount,
          discount,
          tax_amount: taxAmount,
          total: totalAmount,
          total_amount: totalAmount,
          amount_paid:
            paymentStatus === 'paid'
              ? totalAmount
              : paymentStatus === 'partial'
                ? Number((totalAmount * 0.4).toFixed(2))
                : 0,
          notes: `Seeded invoice ${i + 1} for company ${companyIndex + 1}`,
          terms: 'Payment due within 15 days from invoice issue date.',
          fbr_usin:
            status === 'paid' || status === 'partially_paid'
              ? `USIN-${companyIndex + 1}-${i + 1}`
              : null,
          fbr_invoice_number:
            status === 'paid' || status === 'partially_paid'
              ? `USIN-${companyIndex + 1}-${i + 1}`
              : null,
          fbr_status:
            status === 'paid' || status === 'partially_paid'
              ? 'accepted'
              : status === 'sent' || status === 'overdue'
                ? 'submitted'
                : 'not_submitted',
          qr_code_data: null,
          qr_code_path: null,
          qr_code_url: null,
          pdf_path: null,
          sent_at: status === 'sent' || status === 'paid' || status === 'partially_paid' ? now : null,
          created_at: now,
          updated_at: now,
        })

        invoiceItems.push({
          id: uuidv4(),
          invoice_id: invoiceId,
          sort_order: 0,
          description: `Seed Product ${i + 1}`,
          unit: 'piece',
          product_name: `Seed Product ${i + 1}`,
          hsn_code: null,
          quantity: 1,
          unit_price: subtotal,
          tax_rate_id: null,
          tax_rate_percentage: taxRate,
          discount,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          line_total: totalAmount,
          total_price: totalAmount,
          created_at: now,
          updated_at: now,
        })
      }
    })

    await queryInterface.bulkInsert('invoices', invoices)
    await queryInterface.bulkInsert('invoice_items', invoiceItems)

    console.info('[Seed] 2 companies, 2 users, 10 clients, and 20 invoices created.')
    console.info('[Seed] Admin login: admin@fbr.local / Admin@1234')
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('invoice_items', null, {})
    await queryInterface.bulkDelete('invoices', null, {})
    await queryInterface.bulkDelete('clients', null, {})
    await queryInterface.bulkDelete('tax_rates', null, {})
    await queryInterface.bulkDelete('role_user', null, {})
    await queryInterface.bulkDelete('permissions', null, {})
    await queryInterface.bulkDelete('roles', null, {})
    await queryInterface.bulkDelete('users', null, {})
    await queryInterface.bulkDelete('company_settings', null, {})
    await queryInterface.bulkDelete('companies', null, {})
  },
}
