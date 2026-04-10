import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import ErrorAlert from '../components/ErrorAlert'
import { useAuth } from '../context/AuthContext'
import {
  clientDetailRequest,
  clientsListRequest,
  createInvoiceRequest,
  invoiceDetailRequest,
  sendInvoiceRequest,
  taxRatesListRequest,
  updateInvoiceRequest,
} from '../services/authApi'
import { getApiErrorMessage } from '../utils/errorMessage'

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 2,
})

function formatCurrency(value) {
  return CURRENCY_FORMATTER.format(Number(value || 0))
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundCurrency(value) {
  return Number(toNumber(value).toFixed(2))
}

function normalizeOptional(value) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateString, dayCount) {
  const date = new Date(dateString)

  if (Number.isNaN(date.getTime())) {
    return todayDateString()
  }

  date.setDate(date.getDate() + dayCount)
  return date.toISOString().slice(0, 10)
}

function buildEmptyItem() {
  return {
    id: crypto.randomUUID(),
    description: '',
    quantity: '1',
    unit: '',
    unit_price: '0',
    tax_rate_id: '',
    tax_rate_percentage: '17',
  }
}

function buildClientOptionLabel(client) {
  const taxId = client.ntn ? `NTN ${client.ntn}` : client.cnic ? `CNIC ${client.cnic}` : 'No Tax ID'
  return `${client.name} (${taxId})`
}

function statusBadgeClass(status) {
  const normalized = String(status || '').toLowerCase()

  if (normalized === 'draft') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-300'
  }

  if (normalized === 'sent' || normalized === 'partially_paid') {
    return 'border-sky-500/40 bg-sky-500/10 text-sky-300'
  }

  if (normalized === 'paid') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
  }

  return 'border-zinc-700 bg-zinc-800 text-zinc-300'
}

function InvoiceFormPage() {
  const { id: invoiceId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { accessToken } = useAuth()

  const isEdit = Boolean(invoiceId)

  const [clients, setClients] = useState([])
  const [isLoadingClients, setIsLoadingClients] = useState(true)
  const [clientSearch, setClientSearch] = useState('')
  const [showClientSuggestions, setShowClientSuggestions] = useState(false)

  const [form, setForm] = useState({
    client_id: '',
    issue_date: todayDateString(),
    due_date: addDays(todayDateString(), 30),
    currency: 'PKR',
    discount_type: '',
    discount_value: '0',
    notes: '',
    terms: '',
    items: [buildEmptyItem()],
  })

  const [errors, setErrors] = useState({})
  const [serverMessage, setServerMessage] = useState('')
  const [taxRates, setTaxRates] = useState([])
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(isEdit)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dragIndex, setDragIndex] = useState(-1)

  const selectedClient = useMemo(
    () => clients.find(client => client.id === form.client_id) || null,
    [clients, form.client_id]
  )

  const filteredClients = useMemo(() => {
    const needle = clientSearch.trim().toLowerCase()

    if (!needle) {
      return clients.slice(0, 8)
    }

    return clients
      .filter(client => {
        const searchSurface = [client.name, client.email, client.ntn, client.cnic]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return searchSurface.includes(needle)
      })
      .slice(0, 8)
  }, [clientSearch, clients])

  const lines = useMemo(() => {
    return form.items.map((item, index) => {
      const quantity = toNumber(item.quantity)
      const unitPrice = toNumber(item.unit_price)
      const taxRate = toNumber(item.tax_rate_percentage)

      const baseAmount = roundCurrency(quantity * unitPrice)
      const taxAmount = roundCurrency((baseAmount * taxRate) / 100)
      const lineTotal = roundCurrency(baseAmount + taxAmount)

      return {
        index,
        item,
        quantity,
        unitPrice,
        taxRate,
        baseAmount,
        taxAmount,
        lineTotal,
      }
    })
  }, [form.items])

  const totals = useMemo(() => {
    const subtotal = roundCurrency(lines.reduce((sum, line) => sum + line.baseAmount, 0))
    const taxAmount = roundCurrency(lines.reduce((sum, line) => sum + line.taxAmount, 0))

    const normalizedDiscountType = form.discount_type || null
    const discountValue = roundCurrency(form.discount_value)
    const discountAmount =
      normalizedDiscountType === 'percentage'
        ? roundCurrency((subtotal * discountValue) / 100)
        : normalizedDiscountType === 'fixed'
          ? roundCurrency(Math.min(discountValue, subtotal))
          : 0

    const total = roundCurrency(subtotal - discountAmount + taxAmount)

    const taxBreakdownMap = lines.reduce((accumulator, line) => {
      const key = Number(line.taxRate).toFixed(2)

      if (!accumulator[key]) {
        accumulator[key] = {
          rate: Number(key),
          taxableAmount: 0,
          taxAmount: 0,
        }
      }

      accumulator[key].taxableAmount = roundCurrency(accumulator[key].taxableAmount + line.baseAmount)
      accumulator[key].taxAmount = roundCurrency(accumulator[key].taxAmount + line.taxAmount)

      return accumulator
    }, {})

    const taxBreakdown = Object.values(taxBreakdownMap).sort((a, b) => a.rate - b.rate)

    return {
      subtotal,
      taxAmount,
      discountAmount,
      total,
      taxBreakdown,
    }
  }, [form.discount_type, form.discount_value, lines])

  useEffect(() => {
    let isMounted = true

    async function loadClients() {
      setIsLoadingClients(true)

      try {
        const response = await clientsListRequest(accessToken, {
          page: 1,
          per_page: 100,
          status: 'active',
        })

        if (!isMounted) {
          return
        }

        const loadedClients = response.data?.data || []
        setClients(loadedClients)

        const taxRatesResponse = await taxRatesListRequest(accessToken)
        const loadedTaxRates = taxRatesResponse.data?.data || []
        setTaxRates(loadedTaxRates)

        const defaultTaxRate = loadedTaxRates.find(rate => rate.is_default)

        if (defaultTaxRate) {
          setForm(current => ({
            ...current,
            items: current.items.map(item => ({
              ...item,
              tax_rate_id: item.tax_rate_id || defaultTaxRate.id,
              tax_rate_percentage: String(defaultTaxRate.rate_percentage),
            })),
          }))
        }
      } catch (error) {
        if (!isMounted) {
          return
        }

        setServerMessage(getApiErrorMessage(error, 'Unable to load clients for invoice creation.'))
      } finally {
        if (isMounted) {
          setIsLoadingClients(false)
        }
      }
    }

    loadClients()

    return () => {
      isMounted = false
    }
  }, [accessToken])

  useEffect(() => {
    let isMounted = true

    async function loadInvoice() {
      if (!isEdit) {
        setIsLoadingInvoice(false)
        return
      }

      setIsLoadingInvoice(true)

      try {
        const response = await invoiceDetailRequest(accessToken, invoiceId)
        const invoice = response.data?.data

        if (!isMounted || !invoice) {
          return
        }

        const mappedItems = Array.isArray(invoice.items) && invoice.items.length > 0
          ? invoice.items.map((item, index) => ({
              id: item.id || `${index}-${Date.now()}`,
              description: item.description || '',
              quantity: String(item.quantity ?? '1'),
              unit: item.unit || '',
              unit_price: String(item.unit_price ?? '0'),
              tax_rate_id: item.tax_rate_id || '',
              tax_rate_percentage: String(item.tax_rate_percentage ?? '0'),
            }))
          : [buildEmptyItem()]

        setForm({
          client_id: invoice.client_id || '',
          issue_date: invoice.issue_date || todayDateString(),
          due_date: invoice.due_date || addDays(todayDateString(), 30),
          currency: invoice.currency || 'PKR',
          discount_type: invoice.discount_type || '',
          discount_value: String(invoice.discount_value || '0'),
          notes: invoice.notes || '',
          terms: invoice.terms || '',
          items: mappedItems,
        })
      } catch (error) {
        if (!isMounted) {
          return
        }

        setServerMessage(
          getApiErrorMessage(error, 'Unable to load invoice details for editing. Please try again.')
        )
      } finally {
        if (isMounted) {
          setIsLoadingInvoice(false)
        }
      }
    }

    loadInvoice()

    return () => {
      isMounted = false
    }
  }, [accessToken, invoiceId, isEdit])

  useEffect(() => {
    if (!selectedClient) {
      return
    }

    setClientSearch(buildClientOptionLabel(selectedClient))
  }, [selectedClient])

  useEffect(() => {
    if (isEdit || isLoadingClients || form.client_id) {
      return
    }

    const queryClientId = searchParams.get('client_id')
    if (!queryClientId) {
      return
    }

    const clientFromList = clients.find(client => client.id === queryClientId)
    if (clientFromList) {
      setForm(current => ({
        ...current,
        client_id: clientFromList.id,
      }))
      setClientSearch(buildClientOptionLabel(clientFromList))
      return
    }

    async function prefillClientFromQuery() {
      try {
        const response = await clientDetailRequest(accessToken, queryClientId)
        const client = response.data?.data?.client

        if (!client) {
          return
        }

        setClients(current => {
          if (current.some(item => item.id === client.id)) {
            return current
          }

          return [client, ...current]
        })

        setForm(current => ({
          ...current,
          client_id: client.id,
        }))
        setClientSearch(buildClientOptionLabel(client))
      } catch (_error) {
        // Ignore prefill errors so the user can manually pick a client.
      }
    }

    prefillClientFromQuery()
  }, [accessToken, clients, form.client_id, isEdit, isLoadingClients, searchParams])

  function updateField(name, value) {
    setForm(current => ({
      ...current,
      [name]: value,
    }))

    setErrors(current => ({
      ...current,
      [name]: '',
    }))
    setServerMessage('')
  }

  function updateItem(index, key, value) {
    setForm(current => {
      const items = current.items.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item
        }

        const updated = {
          ...item,
          [key]: value,
        }

        if (key === 'tax_rate_id') {
          const selectedRate = taxRates.find(rate => rate.id === value)

          if (selectedRate) {
            updated.tax_rate_percentage = String(selectedRate.rate_percentage)
          }
        }

        return updated
      })

      return {
        ...current,
        items,
      }
    })

    setErrors(current => ({
      ...current,
      items: '',
    }))
    setServerMessage('')
  }

  function addItem() {
    setForm(current => ({
      ...current,
      items: [...current.items, buildEmptyItem()],
    }))
  }

  function removeItem(index) {
    setForm(current => {
      if (current.items.length <= 1) {
        return current
      }

      return {
        ...current,
        items: current.items.filter((_, itemIndex) => itemIndex !== index),
      }
    })
  }

  function moveItem(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= form.items.length) {
      return
    }

    setForm(current => {
      const cloned = [...current.items]
      const [removed] = cloned.splice(fromIndex, 1)
      cloned.splice(toIndex, 0, removed)
      return {
        ...current,
        items: cloned,
      }
    })
  }

  function validateForm() {
    const nextErrors = {}

    if (!form.client_id) {
      nextErrors.client_id = 'Client is required'
    }

    if (!form.issue_date) {
      nextErrors.issue_date = 'Issue date is required'
    }

    if (!form.due_date) {
      nextErrors.due_date = 'Due date is required'
    }

    if (form.issue_date && form.due_date && new Date(form.due_date) < new Date(form.issue_date)) {
      nextErrors.due_date = 'Due date cannot be earlier than issue date'
    }

    if (!Array.isArray(form.items) || form.items.length === 0) {
      nextErrors.items = 'Add at least one line item'
    } else {
      const invalidLine = form.items.find(item => {
        return (
          !String(item.description || '').trim() ||
          toNumber(item.quantity) <= 0 ||
          toNumber(item.unit_price) < 0 ||
          toNumber(item.tax_rate_percentage) < 0 ||
          toNumber(item.tax_rate_percentage) > 100
        )
      })

      if (invalidLine) {
        nextErrors.items = 'Each line item requires description, positive quantity, and valid pricing/tax.'
      }
    }

    if (form.discount_type && !['percentage', 'fixed'].includes(form.discount_type)) {
      nextErrors.discount_type = 'Discount type must be percentage or fixed'
    }

    const discountValue = toNumber(form.discount_value)
    if (discountValue < 0) {
      nextErrors.discount_value = 'Discount value must be non-negative'
    }

    if (form.discount_type === 'percentage' && discountValue > 100) {
      nextErrors.discount_value = 'Percentage discount cannot exceed 100'
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function buildPayload() {
    return {
      client_id: form.client_id,
      issue_date: form.issue_date,
      due_date: form.due_date,
      currency: (form.currency || 'PKR').toUpperCase(),
      discount_type: form.discount_type || null,
      discount_value: roundCurrency(form.discount_value),
      notes: normalizeOptional(form.notes),
      terms: normalizeOptional(form.terms),
      items: form.items.map((item, index) => ({
        description: String(item.description || '').trim(),
        quantity: toNumber(item.quantity),
        unit: normalizeOptional(item.unit),
        unit_price: roundCurrency(item.unit_price),
        tax_rate_id: normalizeOptional(item.tax_rate_id),
        tax_rate_percentage: roundCurrency(item.tax_rate_percentage),
        sort_order: index,
      })),
    }
  }

  async function submitForm(sendAfterSave) {
    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    setServerMessage('')

    try {
      const payload = buildPayload()

      let savedInvoiceId = invoiceId
      if (isEdit) {
        await updateInvoiceRequest(accessToken, invoiceId, payload)
      } else {
        const response = await createInvoiceRequest(accessToken, payload)
        savedInvoiceId = response.data?.data?.id
      }

      if (!savedInvoiceId) {
        navigate('/invoices')
        return
      }

      if (sendAfterSave) {
        await sendInvoiceRequest(accessToken, savedInvoiceId)
      }

      navigate(`/invoices/${savedInvoiceId}`)
    } catch (error) {
      setServerMessage(getApiErrorMessage(error, 'Unable to save invoice right now. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoadingInvoice) {
    return (
      <div className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
        <div className="mx-auto max-w-7xl">
          <div className="h-20 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
          <div className="mt-4 h-[36rem] animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Invoice Builder</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">
              {isEdit ? 'Edit Invoice' : 'Create Invoice'}
            </h1>
            {isEdit ? (
              <p className="mt-2 text-sm text-zinc-400">
                Draft-only editing is enforced by backend policy.
              </p>
            ) : null}
          </div>

          <Link
            to={isEdit ? `/invoices/${invoiceId}` : '/invoices'}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
          >
            Back
          </Link>
        </header>

        {serverMessage ? <ErrorAlert title="Invoice Save Failed" message={serverMessage} /> : null}

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-zinc-300">Client *</label>
                <input
                  value={clientSearch}
                  onChange={event => {
                    setClientSearch(event.target.value)
                    setShowClientSuggestions(true)
                    setForm(current => ({
                      ...current,
                      client_id: '',
                    }))
                    setErrors(current => ({
                      ...current,
                      client_id: '',
                    }))
                  }}
                  onFocus={() => setShowClientSuggestions(true)}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowClientSuggestions(false)
                    }, 120)
                  }}
                  placeholder={isLoadingClients ? 'Loading clients...' : 'Type to search client'}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                />

                {showClientSuggestions && filteredClients.length > 0 ? (
                  <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-1">
                    {filteredClients.map(client => (
                      <button
                        key={client.id}
                        type="button"
                        onMouseDown={event => {
                          event.preventDefault()
                          setForm(current => ({
                            ...current,
                            client_id: client.id,
                          }))
                          setClientSearch(buildClientOptionLabel(client))
                          setShowClientSuggestions(false)
                          setErrors(current => ({
                            ...current,
                            client_id: '',
                          }))
                        }}
                        className="block w-full rounded-md px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                      >
                        <span className="font-medium text-zinc-100">{client.name}</span>
                        <span className="ml-2 text-xs text-zinc-400">
                          {client.ntn ? `NTN ${client.ntn}` : client.cnic ? `CNIC ${client.cnic}` : 'No Tax ID'}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {selectedClient ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    Selected: {selectedClient.name} | {selectedClient.client_type}
                  </p>
                ) : null}

                {errors.client_id ? <p className="mt-1 text-xs text-zinc-400">{errors.client_id}</p> : null}
              </div>

              <label>
                <span className="mb-2 block text-sm text-zinc-300">Issue Date *</span>
                <input
                  type="date"
                  value={form.issue_date}
                  onChange={event => updateField('issue_date', event.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                />
                {errors.issue_date ? <p className="mt-1 text-xs text-zinc-400">{errors.issue_date}</p> : null}
              </label>

              <label>
                <span className="mb-2 block text-sm text-zinc-300">Due Date *</span>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={event => updateField('due_date', event.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                />
                {errors.due_date ? <p className="mt-1 text-xs text-zinc-400">{errors.due_date}</p> : null}
              </label>

              <label>
                <span className="mb-2 block text-sm text-zinc-300">Currency</span>
                <input
                  value={form.currency}
                  onChange={event => updateField('currency', event.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                  placeholder="PKR"
                />
              </label>
            </div>

            <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm uppercase tracking-[0.16em] text-zinc-500">Line Items</h2>
                <button
                  type="button"
                  onClick={addItem}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-500"
                >
                  Add Item
                </button>
              </div>

              {errors.items ? <p className="mb-3 text-xs text-zinc-400">{errors.items}</p> : null}

              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.14em] text-zinc-500">
                    <th className="px-2 py-2">Drag</th>
                    <th className="px-2 py-2">Description</th>
                    <th className="px-2 py-2">Qty</th>
                    <th className="px-2 py-2">Unit</th>
                    <th className="px-2 py-2">Unit Price</th>
                    <th className="px-2 py-2">Tax Rate</th>
                    <th className="px-2 py-2 text-right">Line Total</th>
                    <th className="px-2 py-2">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {lines.map(line => (
                    <tr
                      key={line.item.id}
                      draggable
                      onDragStart={() => setDragIndex(line.index)}
                      onDragOver={event => event.preventDefault()}
                      onDrop={() => {
                        moveItem(dragIndex, line.index)
                        setDragIndex(-1)
                      }}
                      className="bg-zinc-900"
                    >
                      <td className="rounded-l-lg px-2 py-2 text-zinc-500">::</td>
                      <td className="px-2 py-2">
                        <input
                          value={line.item.description}
                          onChange={event => updateItem(line.index, 'description', event.target.value)}
                          placeholder="Item description"
                          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={line.item.quantity}
                          onChange={event => updateItem(line.index, 'quantity', event.target.value)}
                          className="w-24 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={line.item.unit}
                          onChange={event => updateItem(line.index, 'unit', event.target.value)}
                          placeholder="piece"
                          className="w-24 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.item.unit_price}
                          onChange={event => updateItem(line.index, 'unit_price', event.target.value)}
                          className="w-28 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={line.item.tax_rate_id || ''}
                          onChange={event => updateItem(line.index, 'tax_rate_id', event.target.value)}
                          className="w-24 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                        >
                          <option value="">Custom %</option>
                          {taxRates.map(rate => (
                            <option key={rate.id} value={rate.id}>
                              {rate.name} ({Number(rate.rate_percentage || 0).toFixed(2)}%)
                            </option>
                          ))}
                        </select>
                        {!line.item.tax_rate_id ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.item.tax_rate_percentage}
                            onChange={event => updateItem(line.index, 'tax_rate_percentage', event.target.value)}
                            className="mt-1 w-24 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none transition focus:border-zinc-400"
                          />
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-right text-zinc-300">{formatCurrency(line.lineTotal)}</td>
                      <td className="rounded-r-lg px-2 py-2">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => moveItem(line.index, line.index - 1)}
                            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(line.index, line.index + 1)}
                            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(line.index)}
                            className="rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/15"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-2 block text-sm text-zinc-300">Discount Type</span>
                <select
                  value={form.discount_type}
                  onChange={event => updateField('discount_type', event.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                >
                  <option value="">No Discount</option>
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed</option>
                </select>
                {errors.discount_type ? <p className="mt-1 text-xs text-zinc-400">{errors.discount_type}</p> : null}
              </label>

              <label>
                <span className="mb-2 block text-sm text-zinc-300">Discount Value</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discount_value}
                  onChange={event => updateField('discount_value', event.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                />
                {errors.discount_value ? <p className="mt-1 text-xs text-zinc-400">{errors.discount_value}</p> : null}
              </label>

              <label className="md:col-span-2">
                <span className="mb-2 block text-sm text-zinc-300">Notes</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={event => updateField('notes', event.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                  placeholder="Optional notes shown on the invoice"
                />
              </label>

              <label className="md:col-span-2">
                <span className="mb-2 block text-sm text-zinc-300">Terms</span>
                <textarea
                  rows={3}
                  value={form.terms}
                  onChange={event => updateField('terms', event.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                  placeholder="Payment terms and conditions"
                />
              </label>
            </div>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-sm uppercase tracking-[0.16em] text-zinc-500">Totals</h2>

              <div className="mt-4 space-y-2 text-sm text-zinc-300">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Discount</span>
                  <span>- {formatCurrency(totals.discountAmount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Tax</span>
                  <span>{formatCurrency(totals.taxAmount)}</span>
                </div>
              </div>

              <div className="mt-4 border-t border-zinc-700 pt-3">
                <div className="flex items-center justify-between text-lg font-semibold text-zinc-100">
                  <span>Total</span>
                  <span>{formatCurrency(totals.total)}</span>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-sm uppercase tracking-[0.16em] text-zinc-500">Tax Breakdown</h2>
              <div className="mt-3 space-y-2 text-sm text-zinc-300">
                {totals.taxBreakdown.map(breakdown => (
                  <div key={String(breakdown.rate)} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                    <p className="text-zinc-100">{breakdown.rate.toFixed(2)}%</p>
                    <p className="mt-1 text-xs text-zinc-400">Taxable: {formatCurrency(breakdown.taxableAmount)}</p>
                    <p className="mt-1 text-xs text-zinc-400">Tax: {formatCurrency(breakdown.taxAmount)}</p>
                  </div>
                ))}

                {totals.taxBreakdown.length === 0 ? (
                  <p className="text-zinc-500">No tax rows yet.</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              {isEdit ? (
                <span className={`rounded-full border px-2.5 py-1 text-xs uppercase ${statusBadgeClass('draft')}`}>
                  Draft Editable
                </span>
              ) : null}

              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => submitForm(false)}
                  disabled={isSubmitting}
                  className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? 'Saving...' : 'Save as Draft'}
                </button>
                <button
                  type="button"
                  onClick={() => submitForm(true)}
                  disabled={isSubmitting}
                  className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-4 py-2.5 text-sm font-medium text-sky-200 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? 'Saving...' : 'Save and Send'}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default InvoiceFormPage
