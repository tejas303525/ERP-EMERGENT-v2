"""
SMTP Email Service using Nodemailer
Phase 3: Replace Resend with SMTP email queue
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from typing import Optional, List
from datetime import datetime, timezone
import asyncio

class SMTPEmailService:
    """SMTP-based email sending service"""
    
    def __init__(self, db):
        self.db = db
        self.smtp_host = os.getenv('SMTP_HOST', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', 587))
        self.smtp_user = os.getenv('SMTP_USER', '')
        self.smtp_password = os.getenv('SMTP_PASSWORD', '')
        self.smtp_from = os.getenv('SMTP_FROM', self.smtp_user)
        self.max_attempts = 3
    
    def is_configured(self) -> bool:
        """Check if SMTP is properly configured"""
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)
    
    async def queue_email(
        self,
        to: str,
        subject: str,
        html: str,
        cc: Optional[List[str]] = None,
        ref_type: Optional[str] = None,
        ref_id: Optional[str] = None,
        attachments: Optional[List[Dict]] = None
    ) -> str:
        """
        Queue an email for sending
        Returns: email_id
        """
        email_doc = {
            "id": str(__import__('uuid').uuid4()),
            "to": to,
            "cc": cc or [],
            "subject": subject,
            "html": html,
            "status": "QUEUED",
            "attempts": 0,
            "lastError": None,
            "refType": ref_type,
            "refId": ref_id,
            "attachments": attachments or [],
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "sentAt": None
        }
        
        await self.db.email_outbox.insert_one(email_doc)
        return email_doc['id']
    
    async def send_queued_email(self, email_id: str) -> bool:
        """
        Send a queued email via SMTP
        Returns: True if sent successfully, False otherwise
        """
        email = await self.db.email_outbox.find_one({"id": email_id})
        if not email:
            return False
        
        if not self.is_configured():
            await self.db.email_outbox.update_one(
                {"id": email_id},
                {"$set": {
                    "status": "FAILED",
                    "lastError": "SMTP not configured"
                }}
            )
            return False
        
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['From'] = self.smtp_from
            msg['To'] = email['to']
            if email.get('cc'):
                msg['Cc'] = ', '.join(email['cc'])
            msg['Subject'] = email['subject']
            
            # Attach HTML body
            html_part = MIMEText(email['html'], 'html')
            msg.attach(html_part)
            
            # Attach files if any
            for attachment in email.get('attachments', []):
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(attachment['data'])
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename= {attachment["filename"]}'
                )
                msg.attach(part)
            
            # Send via SMTP
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                
                recipients = [email['to']]
                if email.get('cc'):
                    recipients.extend(email['cc'])
                
                server.sendmail(self.smtp_from, recipients, msg.as_string())
            
            # Mark as sent
            await self.db.email_outbox.update_one(
                {"id": email_id},
                {"$set": {
                    "status": "SENT",
                    "sentAt": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            return True
            
        except Exception as e:
            # Update failure info
            attempts = email.get('attempts', 0) + 1
            status = "FAILED" if attempts >= self.max_attempts else "QUEUED"
            
            await self.db.email_outbox.update_one(
                {"id": email_id},
                {"$set": {
                    "status": status,
                    "attempts": attempts,
                    "lastError": str(e)
                }}
            )
            
            return False
    
    async def process_queue(self, batch_size: int = 10):
        """
        Process queued emails (for worker)
        """
        queued_emails = await self.db.email_outbox.find({
            "status": "QUEUED",
            "attempts": {"$lt": self.max_attempts}
        }).sort("createdAt", 1).limit(batch_size).to_list(batch_size)
        
        results = {
            "processed": 0,
            "sent": 0,
            "failed": 0
        }
        
        for email in queued_emails:
            results["processed"] += 1
            success = await self.send_queued_email(email['id'])
            if success:
                results["sent"] += 1
            else:
                results["failed"] += 1
            
            # Small delay between emails to avoid rate limiting
            await asyncio.sleep(1)
        
        return results


async def email_worker_loop(db, interval_seconds: int = 60):
    """
    Background worker that processes email queue
    Run this as a separate process or background task
    """
    email_service = SMTPEmailService(db)
    
    print(f"Email worker started. SMTP configured: {email_service.is_configured()}")
    
    while True:
        try:
            if email_service.is_configured():
                results = await email_service.process_queue()
                if results['processed'] > 0:
                    print(f"Email batch: {results['sent']} sent, {results['failed']} failed")
            else:
                print("SMTP not configured. Skipping email processing.")
            
            await asyncio.sleep(interval_seconds)
            
        except Exception as e:
            print(f"Email worker error: {str(e)}")
            await asyncio.sleep(interval_seconds)
