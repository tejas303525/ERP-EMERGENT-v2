import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import './ViewQuote.css';

// Number to words conversion function
const numberToWords = (num) => {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  
  const convertHundreds = (n) => {
    let result = "";
    if (n >= 100) {
      result += ones[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n >= 20) {
      result += tens[Math.floor(n / 10)] + " ";
      n %= 10;
    } else if (n >= 10) {
      result += teens[n - 10] + " ";
      return result;
    }
    if (n > 0) {
      result += ones[n] + " ";
    }
    return result;
  };
  
  if (num === 0) return "Zero";
  
  const integerPart = Math.floor(num);
  const decimalPart = Math.floor((num - integerPart) * 100);
  
  let words = "";
  if (integerPart === 0) {
    words = "Zero";
  } else {
    let remaining = integerPart;
    if (remaining >= 1000000) {
      words += convertHundreds(Math.floor(remaining / 1000000)).trim() + " Million ";
      remaining %= 1000000;
    }
    if (remaining >= 1000) {
      words += convertHundreds(Math.floor(remaining / 1000)).trim() + " Thousand ";
      remaining %= 1000;
    }
    if (remaining > 0) {
      words += convertHundreds(remaining);
    }
    words = words.trim();
  }
  
  if (decimalPart > 0) {
    words += ` and ${decimalPart}/100`;
  }
  
  return words;
};

const ViewQuote = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quotation, setQuotation] = useState(null);
  const [contactForDispatch, setContactForDispatch] = useState({
    name: "Vidhesh",
    phone: "+971 52 299 7006",
    email: "vidhesh@asia-petrochem.com"
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchQuotation();
    fetchContactForDispatch();
  }, [id]);

  const fetchQuotation = async () => {
    try {
      const response = await api.get(`/quotations/${id}`);
      setQuotation(response.data);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load quotation');
      setLoading(false);
    }
  };

  const fetchContactForDispatch = async () => {
    try {
      const response = await api.get('/settings/all');
      if (response.data?.contact_for_dispatch) {
        setContactForDispatch(response.data.contact_for_dispatch);
      }
    } catch (err) {
      console.error('Failed to load contact for dispatch:', err);
      // Use default values if fetch fails
    }
  };

  const downloadPDF = () => {
    const token = localStorage.getItem('erp_token');
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
    window.open(
      `${backendUrl}/api/pdf/quotation/${id}?token=${token}`,
      '_blank'
    );
  };

  const printPDF = () => {
    const token = localStorage.getItem('erp_token');
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
    window.open(
      `${backendUrl}/api/pdf/quotation/${id}?print=true&token=${token}`,
      '_blank'
    );
  };

  if (loading) {
    return (
      <div className="view-quote-container">
        <div className="loading">Loading quotation...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view-quote-container">
        <div className="error">{error}</div>
        <button onClick={() => navigate('/quotations')} className="btn-back">
          Back to Quotations
        </button>
      </div>
    );
  }

  if (!quotation) {
    return null;
  }

  const isLocal = quotation.order_type?.toLowerCase() === 'local' || 
                  quotation.customer_type?.toLowerCase() === 'local';
  
  const currencySymbol = {
    'USD': '$',
    'AED': 'AED ',
    'EUR': '€'
  }[quotation.currency] || '$';

  // Calculate totals
  const subtotal = quotation.subtotal || 0;
  const vatRate = isLocal ? 0.05 : 0;
  const vatAmount = isLocal ? (quotation.vat_amount || subtotal * vatRate) : 0;
  const total = quotation.total || (subtotal + vatAmount);

  return (
    <div className="view-quote-container">
      {/* Action Buttons (print-hidden) */}
      <div className="quote-actions no-print">
        <button onClick={() => navigate('/quotations')} className="btn-back">
          ← Back
        </button>
        <div className="action-buttons">
          <button onClick={downloadPDF} className="btn-download">
            📄 Download PDF
          </button>
          <button onClick={printPDF} className="btn-print">
            🖨️ Print
          </button>
        </div>
      </div>

      {/* Quotation Document */}
      <div className="quote-document">
        {/* Document Title at Top */}
        <div className="document-title">
          {quotation.finance_approved ? 'PROFORMA INVOICE' : 'QUOTATION'}
        </div>

        {/* Header with Logo and Company Info */}
        <div className="quote-header">
          <div className="header-left">
            <img src="/logo.png" alt="Company Logo" className="company-logo" />
          </div>
          <div className="header-center">
            {/* Empty space */}
          </div>
          <div className="header-right">
            <div className="company-info">
              <strong>Asia Petrochemicals LLC</strong><br/>
              PO Box 76283 Ras Al Khaimah U A E.<br/>
              T +971 4 2384533 &nbsp; F +971 4 2384534<br/>
              TRN: 100283348900003
            </div>
          </div>
        </div>

        {/* Document Meta Info */}
        <div className="document-meta">
          <strong>Quotation #:</strong> <strong>{quotation.pfi_number || quotation.inquiry_id}</strong><br/>
          Date: {quotation.created_at?.substring(0, 10)}<br/>
          {quotation.validity_date && `Valid Till: ${quotation.validity_date}`}
        </div>

        {/* Shipper/Receiver Section */}
        <table className="shipper-receiver-table">
          <thead>
            <tr>
              <th>SHIPPER</th>
              <th>RECEIVER/CONSIGNEE</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Asia Petrochemicals LLC</strong><br/>
                Plot # A 23 B, Al Jazeera Industrial Area<br/>
                Ras Al Khaimah, UAE<br/>
                Tel No - 042384533<br/>
                Fax No - 042384534<br/>
                Emirate : Ras al-Khaimah<br/>
                E-Mail : info@asia-petrochem.com
              </td>
              <td>
                {quotation.customer_name && <><strong>{quotation.customer_name}</strong><br/></>}
                {quotation.customer_address && <>{quotation.customer_address}<br/></>}
                {quotation.customer_city || quotation.customer_country ? (
                  <>{[quotation.customer_city, quotation.customer_country].filter(Boolean).join(', ')}<br/></>
                ) : null}
                {quotation.customer_phone && <>Phone: {quotation.customer_phone}<br/></>}
                {quotation.customer_email && <>Email: {quotation.customer_email}</>}
                {!quotation.customer_name && !quotation.customer_address && !quotation.customer_phone && !quotation.customer_email && '—'}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Header Info Table */}
        <table className="header-info-table">
          <tbody>
            <tr>
              <td className="label">PFI Number:</td>
              <td>{quotation.pfi_number}</td>
              <td className="label">Date:</td>
              <td>{quotation.created_at?.substring(0, 10)}</td>
            </tr>
            <tr>
              <td className="label">Currency:</td>
              <td>{quotation.currency}</td>
              <td className="label">Payment Terms:</td>
              <td>{quotation.payment_terms}</td>
            </tr>
            {!isLocal && (
              <>
                <tr>
                  <td className="label">Incoterm:</td>
                  <td>{quotation.incoterm}</td>
                  <td className="label">Port of Loading:</td>
                  <td>{quotation.port_of_loading}</td>
                </tr>
                <tr>
                  <td className="label">Delivery Place:</td>
                  <td>{quotation.delivery_place}</td>
                  <td className="label">Validity:</td>
                  <td>{quotation.validity_days} days</td>
                </tr>
              </>
            )}
          </tbody>
        </table>

        {/* Items Table */}
        <table className="items-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Description of Goods</th>
              <th>{isLocal ? 'Container' : 'Container/Tank'}</th>
              <th>Qty</th>
              <th>Country of Origin</th>
              <th>{isLocal ? 'Unit Price' : 'Unit Price Per MT'}</th>
              <th>Grand Total</th>
            </tr>
          </thead>
          <tbody>
            {quotation.items?.map((item, idx) => {
              const qty = item.quantity || 0;
              const unitPrice = item.unit_price || 0;
              const total = item.total || qty * unitPrice;
              const netWeightKg = item.net_weight_kg || 0;
              // Calculate: (drums * net weight) / 1000
              const qtyMT = (qty * netWeightKg) / 1000;
              const containerType = item.container || item.container_type || quotation.container_type || '—';
              const containerCount = item.container_count || quotation.container_count || 1;
              // Format container as "count x type" if both are available
              const container = containerType !== '—' && containerCount > 0 
                ? `${containerCount} x ${containerType}` 
                : containerType;
              // const netWeightUnit = item.net_weight_kg ? `${item.net_weight_kg} KG` : '—';
              const countryOfOrigin = item.country_of_origin || quotation.country_of_origin || 'UAE';

              return (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>
                    <strong>{item.product_name}</strong>
                    {item.packaging && (
                      <>
                        <br/>
                        <strong>Packing:</strong> {item.packaging}
                        <br/>
                        <strong>Net weight:</strong> {item.net_weight_kg ? `${item.net_weight_kg} kg` : '—'}
                        <br/>
                        <strong>Country of origin:</strong> {item.country_of_origin || quotation.country_of_origin || 'UAE'}
                      </>
                    )}
                  </td>
                  <td>{container}</td>
                  <td className="text-right">{qtyMT.toFixed(3)}</td>
                  {/* <td className="text-center">{netWeightUnit}</td> */}
                  <td className="text-center">{countryOfOrigin}</td>
                  <td className="text-right">{currencySymbol}{unitPrice.toFixed(2)}</td>
                  <td className="text-right">{currencySymbol}{total.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals Table */}
        <table className="totals-table">
          <tbody>
            {isLocal && (
              <tr>
                <td className="label">Subtotal {quotation.currency} Amount:</td>
                <td className="amount">{currencySymbol}{subtotal.toFixed(2)}</td>
              </tr>
            )}
            {isLocal && vatAmount > 0 && (
              <tr>
                <td className="label">VAT (5%)</td>
                <td className="amount">{currencySymbol}{vatAmount.toFixed(2)}</td>
              </tr>
            )}
            <tr>
              <td className="label">Total {quotation.currency} Amount Payable</td>
              <td className="amount">{currencySymbol}{total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        {/* Amount in Words */}
        <div className="amount-words">
          AMOUNT IN WORDS: {numberToWords(total)} {quotation.currency} Only
        </div>

        {/* Shipping Details (Export Only) */}
        {!isLocal && (
          <div className="shipping-details">
            {quotation.port_of_loading && <div>PORT OF LOADING: {quotation.port_of_loading}</div>}
            {quotation.port_of_discharge && <div>PORT OF DISCHARGE: {quotation.port_of_discharge}</div>}
            {quotation.final_port_delivery && <div>FINAL PORT OF DELIVERY: {quotation.final_port_delivery}</div>}
            {quotation.destination_country && <div>DESTINATION COUNTRY: {quotation.destination_country}</div>}
            {quotation.country_of_origin && <div>COUNTRY OF ORIGIN: {quotation.country_of_origin}</div>}
          </div>
        )}

        {/* Point of Loading/Destination (Local Only) */}
        {isLocal && (
          <div className="shipping-details">
            {quotation.point_of_loading && <div>POINT OF LOADING: {quotation.point_of_loading}</div>}
            {quotation.destination && <div>DESTINATION: {quotation.destination}</div>}
          </div>
        )}

        {/* Required Documents */}
        {quotation.required_documents && quotation.required_documents.length > 0 && (
          <div className="section">
            <h3>Documents need to be presented:</h3>
            <ul>
              {quotation.required_documents.map((doc, idx) => (
                <li key={idx}>{doc}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Terms & Conditions */}
        <div className="section">
          <h3>Terms & Conditions:</h3>
          <ol>
            {isLocal ? (
              <>
                <li>INCOTERMS: {quotation.incoterm || 'N/A'}</li>
                <li>PAYMENT TERMS: {quotation.payment_terms || 'N/A'}</li>
                <li>MODE OF TRANSPORT: {quotation.transport_mode || 'ROAD'}</li>
                <li>QUANTITY TOLERANCE : ±5%</li>
                <li>SUPPLY AND DELIVERY OF THE PRODUCTS AS PER ABOVE MENTIONED DETAILS.</li>
                <li>ALL BANKING CHARGES ARE ON APPLICANT ACCOUNT EXCEPT NEGOTIATION CHARGES, DISCOUNTING CHARGES TO BORNE BY THE APPLICANT</li>
                <li>IN CASE OF ANY DISCREPANCY NOTICED IN THE CONSIGNMENT, SHOULD BE NOTIFIED WITHIN 24 HOURS OF THE DELIVERY, FAILING WHICH WE HAVE NO OBLIGATION</li>
                <li>THIS PROFORMA INVOICE SUPERSEDES ALL OTHER CORRESPONDENCES AND IS FINAL AND BINDING ON BOTH BUYER AND SELLER.</li>
                <li>THIS PROFORMA INVOICE IS SUBJECT TO UAE JURISDICTIONS.</li>
                <li>PERIOD OF VALIDITY: {quotation.validity_date || 'N/A'}</li>
              </>
            ) : (
              <>
                <li>INCOTERMS: {quotation.incoterm || 'N/A'}</li>
                <li>PAYMENT TERMS: {quotation.payment_terms || 'N/A'}</li>
                <li>MODE OF TRANSPORT: SEA</li>
                <li>ALL BANK CHARGES OF BENEFICIARY'S BANK ARE ON US AND REMAINING ALL CHARGES ARE ON APPLICANT</li>
                <li>SHIPMENT PERIOD: WITHIN 3 WEEKS ON RECEIPT OF SIGNED PI AND PO</li>
                <li>LABELS: AS PER APC STANDARD</li>
                <li>QUANTITY TOLERANCE: ±5%</li>
                <li>INTEREST @18% PER ANNUM FOR LATE PAYMENTS</li>
                {quotation.incoterm?.toUpperCase() !== 'CIF' && (
                  <li>INSURANCE TO BE COVERED BY THE BUYER</li>
                )}
                <li>SPLIT BILL OF LADING: $250 PER BL EXTRA</li>
                <li>CHANGES IN SHIPPING SCHEDULE WILL INCUR NEW FREIGHT</li>
                <li>EXTRA DAYS ON BL SUBJECT TO SHIPPING LINE APPROVAL & COST</li>
                <li>PERIOD OF VALIDITY: {quotation.validity_date || 'N/A'}</li>
                <li>LABELS: AS PER APC STANDARD</li>
              </>
            )}
          </ol>
        </div>

        {/* Contact for Dispatch */}
        <div className="contact-box">
          <strong>Contact for Dispatch:</strong><br/>
          {contactForDispatch.name}<br/>
          {contactForDispatch.phone}<br/>
          {contactForDispatch.email}
        </div>

        {/* Bank Details */}
        <div className="section">
          <h3>Bank Details:</h3>
          <div className="bank-box">
            <strong>Beneficiary Name:</strong> Asia Petrochemicals LLC<br/>
            <strong>Bank Name:</strong> COMMERCIAL BANK OF DUBAI<br/>
            P.O. Box 2668. Al Ittihad Street. Port Saeed, Deira- DUBAI-UAE<br/>
            <strong>Account Type:</strong> US DOLLAR ACCOUNT<br/>
            <strong>IBAN:</strong> AE6002300001005833726<br/>
            <strong>SWIFT:</strong> CBDBUAEADXXX
          </div>
        </div>

        {/* Stamp and Signature (if approved) */}
        {quotation.finance_approved && (
          <div className="stamp-signature">
            <div className="stamp">
              <img src="/stamp.jpg" alt="Company Stamp" />
            </div>
            <div className="signature">
              <img src="/signature.jpg" alt="Authorized Signature" />
              <div className="signature-label">Authorized Signature</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewQuote;

