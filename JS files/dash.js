$(document).ready(function() {
    // Toggle sidebar collapse
    $('#toggleBtn').on('click', function() {
        $('#sidebar').toggleClass('collapsed');
    });

    // Handle active state on menu items
    $('.menu ul li a').on('click', function(e) {
        // Don't change active state for logout button
        if ($(this).attr('id') !== 'logoutBtn') {
            // Only prevent default if href is '#'
            if ($(this).attr('href') === '#') {
                e.preventDefault();
            }
            // Remove active class from all items
            $('.menu ul li').removeClass('active');
            // Reset all items to default styling
            $('.menu ul li a').css({
                'background': '',
                'color': ''
            });
            // Add active class to clicked item
            $(this).parent().addClass('active');
            // Apply active styling to clicked item
            $(this).css({
                'background': '#000',
                'color': '#fff'
            });
        }
    });

    // Black hover effect on mouse enter (only if not active)
    $('.menu ul li a').on('mouseenter', function() {
        if (!$(this).parent().hasClass('active')) {
            $(this).css({
                'background': '#000',
                'color': '#fff'
            });
        }
    });

    // Remove hover effect on mouse leave (only if not active)
    $('.menu ul li a').on('mouseleave', function() {
        if (!$(this).parent().hasClass('active')) {
            $(this).css({
                'background': '',
                'color': ''
            });
        }
    });

    // Logout functionality
    $('#logoutBtn').on('click', function(e) {
        e.preventDefault();
        
        // Clear any stored user data (localStorage, sessionStorage)
        // Note: Add your specific logout logic here
        
        // Display logout message
        console.log('User logged out successfully');
        
        // Redirect to login page immediately
        // Replace 'login.html' with your actual login page path
        window.location.href = 'login.html';
        
        // Alternative: If you're using an API, you can make an AJAX call
        /*
        $.ajax({
            url: '/api/logout',
            method: 'POST',
            success: function(response) {
                console.log('Logout successful');
                window.location.href = 'login.html';
            },
            error: function(error) {
                console.error('Logout failed:', error);
                alert('Logout failed. Please try again.');
            }
        });
        */
    });

    // Close sidebar on mobile when clicking outside
    $(document).on('click', function(e) {
        if ($(window).width() <= 768) {
            if (!$(e.target).closest('.sidebar').length && !$(e.target).closest('.toggle-btn').length) {
                $('#sidebar').removeClass('mobile-open');
            }
        }
    });

    // Smooth scroll effect for anchor links
    $('a[href^="#"]').on('click', function(e) {
        const target = $(this).attr('href');
        if (target !== '#') {
            e.preventDefault();
            $('html, body').animate({
                scrollTop: $(target).offset().top - 80
            }, 500);
        }
    });
});