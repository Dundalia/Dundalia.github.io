document.getElementById('automata-form').addEventListener('submit', async function(event) {
    event.preventDefault();

    const nrule = document.getElementById('nrule').value;
    const niter = document.getElementById('niter').value;
    const resolution = document.getElementById('resolution').value;
    const space_ratio = document.getElementById('space_ratio').value;
    const expl_ratio = document.getElementById('expl_ratio').value;
    const tag_ratio = document.getElementById('tag_ratio').value;
    const panoramic = document.getElementById('panoramic').checked;

    const response = await fetch('https://your-backend-url.onrender.com/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            nrule, 
            niter, 
            resolution, 
            space_ratio, 
            expl_ratio, 
            tag_ratio, 
            panoramic 
        }),
    });

    const data = await response.json();
    document.getElementById('automata-image').src = 'data:image/png;base64,' + data.image;
});
