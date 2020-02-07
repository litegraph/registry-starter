/** @jsx jsx */
import PropTypes from 'prop-types'
import { jsx } from 'theme-ui'
import { navigate } from 'gatsby'

const Button = ({
  to,
  text,
  variant,
  onClick,
  isDisabled,
  loading,
  icon,
  ...props
}) => {
  return (
    <button
      sx={{
        variant: `buttons.${variant}`,
        opacity: isDisabled ? 0.32 : 1,
        pointerEvents: isDisabled || loading ? 'none' : 'all',
        bg:
          loading &&
          (variant === 'primary'
            ? 'rgba(76, 102, 255, 0.32) !important'
            : 'rgba(255, 255, 255, 0.32) !important'),
        color: loading && 'secondary',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={e => (onClick ? onClick(e) : to ? navigate(to) : '')}
      {...props}
    >
      {icon && <img sx={iconStyles} src={`/${icon}`} alt={'icon'} />}
      {text}
      {loading && (
        <img
          src="/dots.png"
          sx={{ pt: 1, pl: 2, width: '24px' }}
          alt="dots icon"
        />
      )}
    </button>
  )
}

const iconStyles = {
  width: '24px',
  height: '24px',
  pr: 2,
}

Button.propTypes = {
  to: PropTypes.string,
  text: PropTypes.string,
  variant: PropTypes.string,
  onClick: PropTypes.func,
  isDisabled: PropTypes.bool,
  icon: PropTypes.string,
}

export default Button