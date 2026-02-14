from fastapi import FastAPI, Form
from email_utils import send_email

app = FastAPI()

@app.post("/contact")
async def contact_form(
    name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    subject: str = Form(...),
    message: str = Form(...)
):
    smtp_config = {
        "SMTP_HOST": "smtp.mailersend.net",
        "SMTP_PORT": 587,
        "SMTP_USER": "tu_correo@refacrtb.com.mx",
        "SMTP_PASS": "tu_contraseña"
    }

    send_email(subject, message, email, name, phone, "contacto@refacrtb.com.mx", smtp_config)

    return {"message": "Correo enviado correctamente"}
