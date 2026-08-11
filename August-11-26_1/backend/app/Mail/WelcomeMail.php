<?php

namespace App\Mail;

use App\Models\Company;
use App\Models\CompanyAdmin;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class WelcomeMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public CompanyAdmin $admin,
        public Company      $company,
        public ?Carbon      $trialEndsAt,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Welcome to CRM System!');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.welcome');
    }
}
