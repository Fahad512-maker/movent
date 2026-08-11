<?php

namespace App\Mail;

use App\Models\Invoice;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class InvoiceMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Invoice $invoice,
        public string  $paymentUrl,
        public string  $companyName,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Invoice {$this->invoice->invoice_number} from {$this->companyName}",
        );
    }

    public function content(): Content
    {
        $amountDue = (float) $this->invoice->total_amount - (float) $this->invoice->paid_amount;

        return new Content(
            view: 'emails.invoice',
            with: [
                'invoiceNumber' => $this->invoice->invoice_number,
                'clientName'    => $this->invoice->client?->name ?? $this->invoice->customer_name,
                'companyName'   => $this->companyName,
                'issueDate'     => $this->invoice->created_at?->format('d M Y'),
                'dueDate'       => $this->invoice->due_date
                                    ? \Carbon\Carbon::parse($this->invoice->due_date)->format('d M Y')
                                    : null,
                'status'        => $this->invoice->status,
                'currency'      => $this->invoice->currency ?? 'USD',
                'amountDue'     => $amountDue,
                'paymentUrl'    => $this->paymentUrl,
                'notes'         => $this->invoice->notes,
            ],
        );
    }
}
