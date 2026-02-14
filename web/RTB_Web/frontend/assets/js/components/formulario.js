document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("contact-form");
    const submitButton = form.querySelector("button[type='submit']");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        const formData = {
            name: document.getElementById("name").value.trim(),
            email: document.getElementById("email").value.trim(),
            phone: document.getElementById("phone").value.trim(),
            subject: document.getElementById("subject").value.trim(),
            message: document.getElementById("message").value.trim()
        };

        try {
            const response = await fetch("http://localhost:3000/api/contacto", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(formData)
            });

            let result = {};
            try {
                result = await response.json();
            } catch {
                result = {};
            }

            // Si la respuesta HTTP es 200-299, mostrar éxito aunque no tenga success:true
            if (response.ok) {
                alert("✅ Tu mensaje ha sido enviado con éxito. Se ha generado y subido un PDF con tu información.");
                form.reset();
            } else {
                alert("❌ Error al enviar mensaje: " + (result.message || "intenta de nuevo más tarde."));
            }
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Mensaje';
        }
    });
});
