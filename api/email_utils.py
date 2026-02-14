import smtplib
from email.mime.text import MIMEText

def send_email(subject, message, sender_email, sender_name, phone, to_email, smtp_config):
    body = f"""
    Nuevo mensaje desde el formulario de contacto:

    Nombre: {sender_name}
    Email: {sender_email}
    Teléfono: {phone}
    Asunto: {subject}
    Mensaje:
    {message}
    """

    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From'] = sender_email
    msg['To'] = to_email

    with smtplib.SMTP(smtp_config['SMTP_HOST'], smtp_config['SMTP_PORT']) as server:
        server.starttls()
        server.login(smtp_config['SMTP_USER'], smtp_config['SMTP_PASS'])
        server.send_message(msg)
